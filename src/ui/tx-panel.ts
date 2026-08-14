/**
 * The transactions panel: import a CSV statement, see each movement classified pro/perso
 * with the reason, correct any category in one click (which the tool then remembers), and
 * surface the professional-only CA that should feed the fiscal engine.
 *
 * Opt-in like the rest of the personal space: with no `#transactions` container the panel
 * does nothing and returns `null`. It imports the CSV importer (local, secret-free) but
 * never a connector or the barrel, keeping the browser/secret boundary intact.
 *
 * State (transactions + learned rules) is owned by the host via `load`/`save` so the panel
 * stays storage-agnostic — the vault is the concrete backing, but tests pass plain closures.
 */
import { classifyAll } from '../classify/classify.js'
import { recordCorrection, type LearnedRules } from '../classify/learned.js'
import type { ClassifiedTransaction, TxCategory } from '../classify/types.js'
import { importCsvWithPreset, CSV_PRESETS } from '../transactions/import/csv.js'
import { normalizeAll } from '../transactions/normalize.js'
import type { RawTransaction, Transaction } from '../transactions/types.js'
import { renderTxTable } from './tx-render.js'
import { toTxTableViewModel } from './tx-view-model.js'

/** Persisted slice the panel reads and writes. */
export interface TxPanelData {
  transactions: Transaction[]
  learned: LearnedRules
}

/** What the panel needs from its host, injected for testability. */
export interface TxPanelDeps {
  doc: Document
  now: () => string
  /** Returns the currently persisted transactions + learned rules (empty when locked). */
  load: () => TxPanelData
  /** Persists updated transactions + learned rules (a no-op when there is no open vault). */
  save: (data: TxPanelData) => void | Promise<void>
  /** Called with the pro-only CA whenever it changes, so the host can feed the engine. */
  onProRevenue?: (proRevenue: number) => void
  /** Called after every render, so the host can refresh derived views (e.g. the fiscal table). */
  onChanged?: () => void
}

/** Handle for the host to refresh the panel (e.g. after the vault unlocks). */
export interface TxPanelHandle {
  /** Reloads state from `load()` and re-renders. */
  refresh(): void
  /** The current transactions (mainly for tests/inspection). */
  transactions(): Transaction[]
  /** The current transactions, classified with the learned rules (for derived views). */
  classified(): ClassifiedTransaction[]
}

function byId<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null
}

/** Concatenates and de-duplicates transactions by id (existing ones win). */
function mergeById(existing: Transaction[], incoming: Transaction[]): Transaction[] {
  const seen = new Set(existing.map((t) => t.id))
  return [...existing, ...incoming.filter((t) => !seen.has(t.id))]
}

const CATEGORY_VALUES: ReadonlySet<string> = new Set<TxCategory>(['pro', 'perso', 'unknown'])

/**
 * Parses a pasted import into canonical transactions. `format` is either the special value
 * `json` (a canonical `Transaction[]` produced by the self-hosted connector runner) or a CSV
 * preset key. The local-first equivalent of "connecting" a live source: run the connector
 * outside the browser, drop its JSON here.
 */
function parseImport(text: string, format: string): Transaction[] {
  if (format === 'json') {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new RangeError('Le JSON doit être un tableau de transactions')
    return normalizeAll(parsed as RawTransaction[])
  }
  return normalizeAll(importCsvWithPreset(text, format as keyof typeof CSV_PRESETS))
}

/**
 * Wires the transactions panel if `#transactions` is present, else returns `null`.
 */
export function initTxPanel(deps: TxPanelDeps): TxPanelHandle | null {
  const { doc, now } = deps
  const container = byId(doc, 'transactions')
  if (container === null) return null

  const textarea = byId<HTMLTextAreaElement>(doc, 'tx-input')
  const presetSelect = byId<HTMLSelectElement>(doc, 'tx-preset')
  const importBtn = byId<HTMLButtonElement>(doc, 'tx-import-btn')
  const fileInput = byId<HTMLInputElement>(doc, 'tx-file')
  const tableHost = byId(doc, 'tx-table')
  const msg = byId(doc, 'tx-msg')

  let transactions: Transaction[] = []
  let learned: LearnedRules = {}

  const setMsg = (text: string): void => {
    if (msg !== null) msg.textContent = text
  }

  /** Classifies, renders, wires the per-row selects, and reports the pro CA. */
  const render = (): void => {
    const classified = classifyAll(transactions, learned)
    const vm = toTxTableViewModel(classified)
    if (tableHost !== null) {
      tableHost.innerHTML = renderTxTable(vm)
      for (const sel of Array.from(tableHost.querySelectorAll<HTMLSelectElement>('select.tx-cat'))) {
        sel.addEventListener('change', () => void onCorrect(sel.dataset['txId'] ?? '', sel.value))
      }
    }
    deps.onProRevenue?.(vm.proRevenue)
    deps.onChanged?.()
  }

  /** Applies a manual correction: learns it, persists, re-renders (so peers update too). */
  const onCorrect = async (txId: string, rawCategory: string): Promise<void> => {
    if (!CATEGORY_VALUES.has(rawCategory)) return
    const tx = transactions.find((t) => t.id === txId)
    if (tx === undefined) return
    learned = recordCorrection(learned, tx, rawCategory as TxCategory, now())
    await deps.save({ transactions, learned })
    render()
    setMsg('Correction mémorisée — appliquée aux mouvements similaires.')
  }

  /** Imports the pasted/uploaded CSV using the selected preset. */
  const onImport = async (text: string): Promise<void> => {
    const trimmed = text.trim()
    if (trimmed === '') {
      setMsg('Collez un export CSV, ou choisissez un fichier.')
      return
    }
    const format = presetSelect?.value ?? 'generic'
    try {
      const imported = parseImport(trimmed, format)
      transactions = mergeById(transactions, imported)
      await deps.save({ transactions, learned })
      render()
      setMsg(`${imported.length} transaction(s) importée(s).`)
    } catch {
      setMsg('Import impossible : vérifiez le format et le modèle choisi.')
    }
  }

  importBtn?.addEventListener('click', () => void onImport(textarea?.value ?? ''))

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file === undefined) return
    void file.text().then((text) => onImport(text))
  })

  const refresh = (): void => {
    const data = deps.load()
    transactions = data.transactions
    learned = data.learned
    render()
  }

  refresh()

  return {
    refresh,
    transactions: () => transactions,
    classified: () => classifyAll(transactions, learned),
  }
}
