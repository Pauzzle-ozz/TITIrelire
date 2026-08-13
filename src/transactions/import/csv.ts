/**
 * Universal CSV importer.
 *
 * Every CRM, bank and payment tool can export a CSV, so this is the pragmatic,
 * local-first way to "connect" almost any source: map its columns to the canonical
 * {@link Transaction} fields and feed the result to the tax engine. A small preset
 * registry captures common exports so users rarely have to configure a mapping.
 *
 * The parser is a self-contained RFC-4180-ish reader (quoted fields, `""` escaping,
 * CRLF/LF, `,`/`;`/tab delimiters). Amount and date parsing handle the usual French
 * and English conventions.
 */
import { normalizeAll } from '../normalize.js'
import type { RawTransaction, Transaction } from '../types.js'

/** Which CSV columns map to which canonical fields. Column names match the header row. */
export interface CsvMapping {
  /** Column holding the date. */
  date: string
  /** Column holding a single signed amount. Provide this OR `debit`/`credit`. */
  amount?: string
  /** Column holding debit (money out, unsigned magnitude) — used with `credit`. */
  debit?: string
  /** Column holding credit (money in) — used with `debit`. */
  credit?: string
  label?: string
  currency?: string
  /** Column holding a stable id. When absent, a deterministic id is derived from content. */
  id?: string
  counterparty?: string
  category?: string
}

export interface CsvOptions {
  /** Field delimiter. Auto-detected among `,` `;` tab when omitted. */
  delimiter?: string
  /**
   * Decimal separator. When omitted, it is auto-detected per value; a lone separator is
   * read as a decimal point (so `1,234` → 1.234). For sources that use a lone separator
   * as a thousands group (e.g. some FR bank exports), pass `decimal` explicitly.
   */
  decimal?: '.' | ','
  /** Date layout of the source. Default `iso` (`YYYY-MM-DD`). */
  dateFormat?: 'iso' | 'dd/mm/yyyy' | 'mm/dd/yyyy'
  /** Currency to use when the mapping has no currency column. Default `EUR`. */
  defaultCurrency?: string
  /** `source` stamped on every transaction. Default `csv`. */
  source?: string
  /** Keep the original CSV row in `Transaction.raw`. Default false (data minimization). */
  keepRaw?: boolean
}

/** A named, ready-to-use mapping for a known export format. */
export interface CsvPreset {
  mapping: CsvMapping
  options?: CsvOptions
}

/** Detects the most likely delimiter from the first record, ignoring quoted sections. */
function detectDelimiter(text: string): string {
  const candidates = [',', ';', '\t']
  const counts = new Map<string, number>(candidates.map((c) => [c, 0]))
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') i += 1
        else inQuotes = false
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === '\n') {
      break // end of the first record
    } else if (counts.has(c!)) {
      counts.set(c!, counts.get(c!)! + 1)
    }
  }
  let best = ','
  let bestCount = -1
  for (const c of candidates) {
    const n = counts.get(c)!
    if (n > bestCount) {
      bestCount = n
      best = c
    }
  }
  return best
}

/** Parses CSV text into rows of string cells. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const delim = delimiter ?? detectDelimiter(text)

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  const pushField = (): void => {
    row.push(field)
    field = ''
  }
  const pushRow = (): void => {
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      pushField()
    } else if (c === '\n') {
      pushField()
      pushRow()
    } else if (c !== '\r') {
      field += c
    }
  }
  if (field !== '' || row.length > 0) {
    pushField()
    pushRow()
  }

  // Drop fully-empty rows (e.g. trailing newline).
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ''))
}

/**
 * Parses an amount string, tolerating thousands separators, comma decimals and `(…)`
 * negatives. A lone separator is treated as a decimal point unless `decimal` is given.
 */
export function parseAmount(value: string, decimal?: '.' | ','): number {
  let s = value.replace(/ /g, ' ').trim()
  if (s === '') return Number.NaN

  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  // Keep digits, separators and sign only (strips currency symbols, spaces).
  s = s.replace(/[^\d,.\-+]/g, '')

  if (decimal === ',') {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (decimal === '.') {
    s = s.replace(/,/g, '')
  } else {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    if (lastComma !== -1 && lastDot !== -1) {
      // The right-most separator is the decimal one; the other groups thousands.
      const decimalSep = lastComma > lastDot ? ',' : '.'
      const thousandsSep = decimalSep === ',' ? '.' : ','
      s = s.split(thousandsSep).join('')
      s = s.replace(decimalSep, '.')
    } else if (lastComma !== -1) {
      s = s.replace(',', '.')
    }
  }

  const n = Number(s)
  if (!Number.isFinite(n)) return Number.NaN
  return negative ? -n : n
}

/**
 * Converts a source date to ISO `YYYY-MM-DD`. Non-ISO layouts must have exactly three
 * parts and a 4-digit year; anything else is returned unchanged so normalize rejects it.
 */
export function parseDate(value: string, format: CsvOptions['dateFormat'] = 'iso'): string {
  const v = value.trim()
  if (format === 'iso') return v.slice(0, 10)
  const parts = v.split(/[/.\-]/)
  if (parts.length !== 3) return v
  const [a, b, c] = parts as [string, string, string]
  if (!/^\d{4}$/.test(c)) return v // require an unambiguous 4-digit year
  const pad = (x: string): string => x.padStart(2, '0')
  return format === 'dd/mm/yyyy' ? `${c}-${pad(b)}-${pad(a)}` : `${c}-${pad(a)}-${pad(b)}`
}

/** Small deterministic hash (djb2) for content-derived ids. */
function hash(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/**
 * Imports CSV text into canonical transactions.
 *
 * When no id column is mapped, ids are derived from the row content plus an occurrence
 * counter, so genuinely identical rows (e.g. two same-day, same-amount payments) stay
 * distinct, while the ids remain stable across re-imports of the same source (they do
 * not shift when unrelated rows are added or removed).
 *
 * @throws RangeError if the header is missing a mapped column, or a row is invalid.
 */
export function importCsv(text: string, mapping: CsvMapping, options: CsvOptions = {}): Transaction[] {
  const rows = parseCsv(text, options.delimiter)
  if (rows.length < 2) return []

  const header = rows[0]!.map((h) => h.trim().toLowerCase())
  const index = new Map<string, number>()
  header.forEach((name, i) => {
    if (!index.has(name)) index.set(name, i)
  })

  const column = (name: string | undefined): number | undefined =>
    name === undefined ? undefined : index.get(name.trim().toLowerCase())

  const requireColumn = (name: string): number => {
    const i = column(name)
    if (i === undefined) throw new RangeError(`CSV column not found: "${name}"`)
    return i
  }

  const dateCol = requireColumn(mapping.date)
  const amountCol = mapping.amount !== undefined ? requireColumn(mapping.amount) : undefined
  const debitCol = mapping.debit !== undefined ? requireColumn(mapping.debit) : undefined
  const creditCol = mapping.credit !== undefined ? requireColumn(mapping.credit) : undefined
  if (amountCol === undefined && creditCol === undefined && debitCol === undefined) {
    throw new RangeError('CSV mapping needs either "amount" or "debit"/"credit"')
  }
  const labelCol = column(mapping.label)
  const currencyCol = column(mapping.currency)
  const idCol = column(mapping.id)
  const counterpartyCol = column(mapping.counterparty)
  const categoryCol = column(mapping.category)

  const source = options.source ?? 'csv'
  const cell = (row: string[], i: number | undefined): string =>
    i === undefined ? '' : (row[i] ?? '').trim()

  const occurrence = new Map<string, number>()

  const raws: RawTransaction[] = rows.slice(1).map((row) => {
    const date = parseDate(cell(row, dateCol), options.dateFormat)

    let amount: number
    if (amountCol !== undefined) {
      amount = parseAmount(cell(row, amountCol), options.decimal)
    } else {
      const credit = creditCol !== undefined ? parseAmount(cell(row, creditCol), options.decimal) : 0
      const debit = debitCol !== undefined ? parseAmount(cell(row, debitCol), options.decimal) : 0
      amount = (Number.isFinite(credit) ? credit : 0) - Math.abs(Number.isFinite(debit) ? debit : 0)
    }

    const label = cell(row, labelCol)
    let id: string
    if (idCol !== undefined && cell(row, idCol) !== '') {
      id = cell(row, idCol)
    } else {
      const key = `${date}|${amount}|${label}`
      const n = occurrence.get(key) ?? 0
      occurrence.set(key, n + 1)
      id = `${source}-${hash(`${key}|${n}`)}`
    }

    const raw: RawTransaction = {
      id,
      date,
      amount,
      currency: currencyCol !== undefined ? cell(row, currencyCol) : (options.defaultCurrency ?? 'EUR'),
      label,
      source,
      ...(options.keepRaw ? { raw: row } : {}),
    }
    const counterparty = cell(row, counterpartyCol)
    if (counterparty !== '') raw.counterparty = counterparty
    const category = cell(row, categoryCol)
    if (category !== '') raw.category = category
    return raw
  })

  return normalizeAll(raws)
}

/** Built-in mappings for common exports. */
export const CSV_PRESETS: Record<string, CsvPreset> = {
  generic: {
    mapping: { date: 'date', amount: 'amount', label: 'label', currency: 'currency', id: 'id' },
  },
  stripe: {
    mapping: {
      id: 'id',
      date: 'created',
      amount: 'amount',
      currency: 'currency',
      label: 'description',
    },
    options: { source: 'stripe', dateFormat: 'iso' },
  },
  qonto: {
    mapping: {
      date: 'settlement date',
      credit: 'total amount (incl. vat)',
      currency: 'currency',
      label: 'reference',
      counterparty: 'counterparty name',
    },
    // FR export: a lone comma is the decimal separator.
    options: { source: 'qonto', decimal: ',' },
  },
  paypal: {
    mapping: { date: 'Date', amount: 'Gross', currency: 'Currency', label: 'Name' },
    // FR PayPal activity export: dd/mm/yyyy dates, comma decimals.
    options: { source: 'paypal', dateFormat: 'dd/mm/yyyy', decimal: ',' },
  },
  // Generic FR bank statement with separate Débit/Crédit columns. Bank exports vary a
  // lot; treat this as a starting point and override the mapping if needed.
  bank_fr: {
    mapping: { date: 'Date', label: 'Libellé', debit: 'Débit', credit: 'Crédit' },
    options: { source: 'bank', dateFormat: 'dd/mm/yyyy', decimal: ',' },
  },
}

/** Imports CSV using a named preset, with optional mapping/option overrides. */
export function importCsvWithPreset(
  text: string,
  preset: keyof typeof CSV_PRESETS | CsvPreset,
  overrides: { mapping?: Partial<CsvMapping>; options?: CsvOptions } = {},
): Transaction[] {
  const base = typeof preset === 'string' ? CSV_PRESETS[preset] : preset
  if (base === undefined) throw new RangeError(`Unknown CSV preset: ${String(preset)}`)
  return importCsv(
    text,
    { ...base.mapping, ...overrides.mapping },
    { ...base.options, ...overrides.options },
  )
}
