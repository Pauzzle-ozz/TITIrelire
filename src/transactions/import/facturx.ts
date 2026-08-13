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
 */
import { XMLParser } from 'fast-xml-parser'

import { normalizeAll } from '../normalize.js'
import type { Transaction } from '../types.js'

const parser = new XMLParser({ removeNSPrefix: true, ignoreAttributes: false, parseTagValue: false })

type XmlNode = string | { '#text'?: string; [key: string]: unknown } | undefined

/** Returns the text content of a node (handles both plain strings and `{ '#text' }`). */
function text(node: XmlNode): string | undefined {
  if (typeof node === 'string') return node
  if (node && typeof node === 'object' && typeof node['#text'] === 'string') return node['#text']
  return undefined
}

/** Converts a CII date (format 102, `YYYYMMDD`) to ISO `YYYY-MM-DD`. */
function ciiDateToIso(raw: string | undefined): string {
  if (raw === undefined || !/^\d{8}$/.test(raw)) {
    throw new RangeError(`Factur-X: unexpected issue date "${String(raw)}" (expected YYYYMMDD)`)
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

/**
 * Parses one Factur-X CII XML invoice into a canonical income transaction.
 *
 * The amount is the invoice grand total (TTC, BT-112), i.e. the money the invoice bills.
 *
 * @throws RangeError if the document is not CII or a required field is missing/invalid.
 */
export function parseFacturX(xml: string): Transaction {
  const root = parser.parse(xml) as Record<string, unknown>
  const invoice = root['CrossIndustryInvoice'] as Record<string, unknown> | undefined
  if (invoice === undefined) {
    throw new RangeError('Factur-X: not a Cross Industry Invoice (CII) document')
  }

  const document = invoice['ExchangedDocument'] as Record<string, XmlNode> | undefined
  const transaction = invoice['SupplyChainTradeTransaction'] as Record<string, unknown> | undefined
  const agreement = transaction?.['ApplicableHeaderTradeAgreement'] as Record<string, unknown> | undefined
  const settlement = transaction?.['ApplicableHeaderTradeSettlement'] as Record<string, unknown> | undefined
  const summation = settlement?.['SpecifiedTradeSettlementHeaderMonetarySummation'] as
    | Record<string, XmlNode>
    | undefined

  const invoiceId = text(document?.['ID'])
  if (invoiceId === undefined || invoiceId.trim() === '') {
    throw new RangeError('Factur-X: missing invoice ID')
  }

  const issueDate = (document?.['IssueDateTime'] as Record<string, XmlNode> | undefined)?.['DateTimeString']
  const date = ciiDateToIso(text(issueDate))

  const currency = text(settlement?.['InvoiceCurrencyCode'] as XmlNode)
  if (currency === undefined || currency.trim() === '') {
    throw new RangeError('Factur-X: missing invoice currency')
  }

  const totalRaw = text(summation?.['GrandTotalAmount']) ?? text(summation?.['DuePayableAmount'])
  const amount = Number(totalRaw)
  if (totalRaw === undefined || !Number.isFinite(amount)) {
    throw new RangeError(`Factur-X: missing or invalid grand total "${String(totalRaw)}"`)
  }

  const sellerName = text(
    (agreement?.['SellerTradeParty'] as Record<string, XmlNode> | undefined)?.['Name'],
  )
  const buyerName = text(
    (agreement?.['BuyerTradeParty'] as Record<string, XmlNode> | undefined)?.['Name'],
  )

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
