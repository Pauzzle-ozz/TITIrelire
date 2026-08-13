/**
 * Factur-X import.
 *
 * Factur-X is the Franco-German hybrid e-invoice (a PDF/A-3 carrying a UN/CEFACT CII
 * XML payload), and it becomes mandatory in France (reception 2026-09, emission for
 * VSE/SME 2027-09). This parser turns the **CII XML** of an invoice into a canonical
 * income {@link Transaction}, so an incoming invoice flows straight into turnover.
 *
 * Scope: the standardized CII XML payload (`factur-x.xml`). Extracting the XML from the
 * PDF/A-3 container is a separate step (out of scope here). Runs locally, no secrets.
 *
 * The parser is defensive: it validates the XML is well-formed, tolerates repeated
 * elements (takes the first), checks the date format code (102), validates the amount
 * strictly, and rejects credit notes / non-positive totals rather than silently booking
 * them as expenses.
 */
import { XMLParser, XMLValidator } from 'fast-xml-parser'

import { normalizeAll } from '../normalize.js'
import type { Transaction } from '../types.js'

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false })

/** Returns the value as an object, or undefined if it is a scalar/array/nullish. */
function asObject(node: unknown): Record<string, unknown> | undefined {
  return node !== null && typeof node === 'object' && !Array.isArray(node)
    ? (node as Record<string, unknown>)
    : undefined
}

/** Returns the first element of an array node, or the node itself. */
function first(node: unknown): unknown {
  return Array.isArray(node) ? node[0] : node
}

/** Reads a child value from a (possibly array-wrapped) parent object. */
function child(parent: unknown, key: string): unknown {
  const o = asObject(first(parent))
  return o ? o[key] : undefined
}

/** Returns the text content of a (possibly array-wrapped) node. */
function text(node: unknown): string | undefined {
  const n = first(node)
  if (typeof n === 'string') return n
  const o = asObject(n)
  return o && typeof o['#text'] === 'string' ? o['#text'] : undefined
}

/** Converts a CII date (format 102, `YYYYMMDD`) to ISO `YYYY-MM-DD`. */
function ciiDateToIso(raw: string | undefined, formatCode: string | undefined): string {
  if (formatCode !== undefined && formatCode !== '102') {
    throw new RangeError(`Factur-X: unsupported date format code ${formatCode} (expected 102)`)
  }
  if (raw === undefined || !/^\d{8}$/.test(raw)) {
    throw new RangeError(`Factur-X: unexpected issue date "${String(raw)}" (expected YYYYMMDD)`)
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * Parses one Factur-X CII XML invoice into a canonical income transaction.
 *
 * The amount is the invoice grand total (TTC, BT-112); DuePayableAmount is used only as a
 * fallback when the grand total is absent. Credit notes / non-positive totals are rejected.
 *
 * @throws RangeError if the XML is malformed, not CII, or a required field is missing/invalid.
 */
export function parseFacturX(xml: string): Transaction {
  const validation = XMLValidator.validate(xml)
  if (validation !== true) {
    throw new RangeError(`Factur-X: malformed XML (${validation.err.msg})`)
  }
  let root: Record<string, unknown>
  try {
    root = parser.parse(xml) as Record<string, unknown>
  } catch {
    throw new RangeError('Factur-X: unparseable XML')
  }

  const invoice = asObject(first(root['CrossIndustryInvoice']))
  if (invoice === undefined) {
    throw new RangeError('Factur-X: not a Cross Industry Invoice (CII) document')
  }

  const document = invoice['ExchangedDocument']
  const trade = invoice['SupplyChainTradeTransaction']
  const agreement = child(trade, 'ApplicableHeaderTradeAgreement')
  const settlement = child(trade, 'ApplicableHeaderTradeSettlement')
  const summation = child(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation')

  const invoiceId = text(child(document, 'ID'))
  if (invoiceId === undefined || invoiceId.trim() === '') {
    throw new RangeError('Factur-X: missing invoice ID')
  }

  const dateNode = child(child(document, 'IssueDateTime'), 'DateTimeString')
  const formatCode = text(asObject(first(dateNode))?.['@_format'])
  const date = ciiDateToIso(text(dateNode), formatCode)

  const currency = text(child(settlement, 'InvoiceCurrencyCode'))
  if (currency === undefined || currency.trim() === '') {
    throw new RangeError('Factur-X: missing invoice currency')
  }

  const totalRaw = text(child(summation, 'GrandTotalAmount')) ?? text(child(summation, 'DuePayableAmount'))
  if (totalRaw === undefined || !/^-?\d+(?:\.\d+)?$/.test(totalRaw.trim())) {
    throw new RangeError(`Factur-X: missing or invalid grand total "${String(totalRaw)}"`)
  }
  const amount = Number(totalRaw.trim())
  if (amount <= 0) {
    throw new RangeError(`Factur-X: non-positive total ${amount} (credit notes are not supported)`)
  }

  const buyerName = text(child(child(agreement, 'BuyerTradeParty'), 'Name'))

  return normalizeAll([
    {
      id: invoiceId,
      date,
      amount, // TTC total, positive (income)
      currency,
      label: buyerName !== undefined ? `Facture ${invoiceId} — ${buyerName}` : `Facture ${invoiceId}`,
      ...(buyerName !== undefined ? { counterparty: buyerName } : {}),
      category: 'facture',
      source: 'factur-x',
    },
  ])[0]!
}

/** Parses one or more Factur-X CII XML documents into canonical transactions. */
export function importFacturX(...xmls: string[]): Transaction[] {
  return normalizeAll(xmls.map((xml) => parseFacturX(xml)))
}
