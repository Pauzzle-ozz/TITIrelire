/**
 * Ledger — a simplified compte de résultat built from classified transactions.
 *
 * This is the accounting core of the "fiscal table": it turns the user's real, pro-classified
 * movements into **produits** (income) and **charges** (expenses), grouped by Plan-Comptable-
 * Général-inspired categories, and derives the **résultat** (produits − charges). Only
 * professional transactions count — personal ones are excluded, as they must be.
 *
 * The category mapping is heuristic (keyword-based, like the classification rules) and honest
 * about it: anything it cannot place lands in "autres". It never invents amounts — every euro
 * comes from a real transaction.
 */
import type { ClassifiedTransaction } from '../classify/types.js'
import { normalizeText } from '../classify/rules.js'
import { direction, type AggregateOptions } from '../transactions/types.js'

/** Expense buckets (PCG classes 60–66). */
export type ChargeCategory =
  | 'achats'
  | 'services_exterieurs'
  | 'impots_taxes'
  | 'charges_sociales'
  | 'remunerations'
  | 'charges_financieres'
  | 'autres_charges'

/** Income buckets (PCG class 70/71). */
export type ProduitCategory = 'ventes_prestations' | 'autres_produits'

/** French labels for the buckets, shown in the fiscal table. */
export const CHARGE_LABELS: Record<ChargeCategory, string> = {
  achats: 'Achats',
  services_exterieurs: 'Services extérieurs',
  impots_taxes: 'Impôts et taxes',
  charges_sociales: 'Charges sociales',
  remunerations: 'Rémunérations',
  charges_financieres: 'Charges financières',
  autres_charges: 'Autres charges',
}

export const PRODUIT_LABELS: Record<ProduitCategory, string> = {
  ventes_prestations: "Chiffre d'affaires (ventes / prestations)",
  autres_produits: 'Autres produits',
}

/** One aggregated ledger line. */
export interface LedgerLine {
  category: string
  label: string
  amount: number
  count: number
}

/** The compte de résultat: produits, charges, and the resulting result. */
export interface Ledger {
  produits: { total: number; lines: LedgerLine[] }
  charges: { total: number; lines: LedgerLine[] }
  /** produits.total − charges.total (may be negative = déficit). */
  resultat: number
  currency: string
  transactionCount: number
}

const CHARGE_KEYWORDS: ReadonlyArray<readonly [ChargeCategory, readonly string[]]> = [
  ['charges_sociales', ['urssaf', 'ssi', 'rsi', 'cipav', 'cotisation', 'carpimko']],
  ['impots_taxes', ['cfe', 'tva', 'impot', 'taxe', 'cvae']],
  ['remunerations', ['salaire', 'paie', 'paye', 'remuneration']],
  ['charges_financieres', ['interet', 'agios', 'commission bancaire']],
  ['achats', ['achat', 'fournisseur', 'marchandise', 'matiere', 'stock']],
  [
    'services_exterieurs',
    [
      'loyer', 'assurance', 'abonnement', 'logiciel', 'saas', 'honoraires', 'comptable',
      'frais bancaire', 'telephone', 'internet', 'transport', 'deplacement', 'restaurant',
      'publicite', 'marketing', 'energie', 'electricite', 'eau', 'gaz',
    ],
  ],
]

/** Maps a transaction's text to an expense bucket (default: autres_charges). */
export function chargeCategory(text: string): ChargeCategory {
  const t = normalizeText(text)
  for (const [category, needles] of CHARGE_KEYWORDS) {
    if (needles.some((n) => t.includes(normalizeText(n)))) return category
  }
  return 'autres_charges'
}

/** Maps a transaction's text to an income bucket (default: autres_produits). */
export function produitCategory(text: string): ProduitCategory {
  const t = normalizeText(text)
  if (['vente', 'facture', 'client', 'prestation', 'honoraires', 'stripe', 'paiement'].some((n) => t.includes(n))) {
    return 'ventes_prestations'
  }
  return 'autres_produits'
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

function summarize(
  map: Map<string, { amount: number; count: number }>,
  labels: Record<string, string>,
): { total: number; lines: LedgerLine[] } {
  let total = 0
  const lines: LedgerLine[] = []
  for (const [category, { amount, count }] of map) {
    total += amount
    lines.push({ category, label: labels[category] ?? category, amount: round2(amount), count })
  }
  lines.sort((a, b) => b.amount - a.amount)
  return { total: round2(total), lines }
}

/**
 * Builds the ledger from classified transactions (pro only), after optional year/currency
 * filtering. Income → produits, expenses → charges, each grouped by category.
 */
export function buildLedger(classified: ClassifiedTransaction[], options: AggregateOptions = {}): Ledger {
  const currency = (options.currency ?? 'EUR').toUpperCase()
  const { year } = options
  const produits = new Map<string, { amount: number; count: number }>()
  const charges = new Map<string, { amount: number; count: number }>()
  let transactionCount = 0

  const add = (map: Map<string, { amount: number; count: number }>, key: string, amount: number): void => {
    const cur = map.get(key) ?? { amount: 0, count: 0 }
    map.set(key, { amount: cur.amount + amount, count: cur.count + 1 })
  }

  for (const { transaction, classification } of classified) {
    if (classification.category !== 'pro') continue
    if (year !== undefined && Number(transaction.date.slice(0, 4)) !== year) continue
    if (transaction.currency.toUpperCase() !== currency) continue
    transactionCount += 1
    const text = `${transaction.label} ${transaction.counterparty ?? ''}`
    if (direction(transaction) === 'income') {
      add(produits, produitCategory(text), transaction.amount)
    } else {
      add(charges, chargeCategory(text), -transaction.amount)
    }
  }

  const p = summarize(produits, PRODUIT_LABELS)
  const c = summarize(charges, CHARGE_LABELS)
  return { produits: p, charges: c, resultat: round2(p.total - c.total), currency, transactionCount }
}
