import { describe, expect, it } from 'vitest'

import { aggregateTurnover, importFacturX, parseFacturX } from '../src/index.js'

interface CiiOptions {
  id?: string
  date?: string
  dateFormat?: string
  currency?: string
  grandTotal?: string
  grandTotalAttr?: boolean
  grandTotalEmpty?: boolean
  dupTotal?: boolean
  dueOnly?: boolean
  duePayable?: string
  buyer?: string
  dupBuyer?: boolean
  emptyIssueDate?: boolean
  omit?: 'root' | 'id' | 'currency' | 'total'
}

/** Builds a Factur-X CII XML with overridable / deliberately-broken fields. */
function ciiInvoice(o: CiiOptions): string {
  const {
    id = 'FA-2026-001',
    date = '20260115',
    dateFormat = '102',
    currency = 'EUR',
    grandTotal = '1200.00',
    buyer = 'Client SARL',
  } = o

  const totalNode = (): string => {
    if (o.omit === 'total') return ''
    if (o.dueOnly) return `<ram:DuePayableAmount>${o.duePayable ?? grandTotal}</ram:DuePayableAmount>`
    if (o.grandTotalEmpty) {
      return `<ram:GrandTotalAmount currencyID="${currency}"></ram:GrandTotalAmount>`
    }
    const attr = o.grandTotalAttr ? ` currencyID="${currency}"` : ''
    const main = `<ram:GrandTotalAmount${attr}>${grandTotal}</ram:GrandTotalAmount>`
    const dup = o.dupTotal ? `<ram:GrandTotalAmount>1300.00</ram:GrandTotalAmount>` : ''
    const due = o.duePayable ? `<ram:DuePayableAmount>${o.duePayable}</ram:DuePayableAmount>` : ''
    return `${main}${dup}${due}`
  }

  const dateNode = o.emptyIssueDate
    ? '<ram:IssueDateTime></ram:IssueDateTime>'
    : `<ram:IssueDateTime><udt:DateTimeString format="${dateFormat}">${date}</udt:DateTimeString></ram:IssueDateTime>`

  const buyerNode = `<ram:BuyerTradeParty><ram:Name>${buyer}</ram:Name></ram:BuyerTradeParty>${
    o.dupBuyer ? '<ram:BuyerTradeParty><ram:Name>Autre</ram:Name></ram:BuyerTradeParty>' : ''
  }`

  const body = `
  <rsm:ExchangedDocument>
    ${o.omit === 'id' ? '' : `<ram:ID>${id}</ram:ID>`}
    ${dateNode}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Mon Entreprise</ram:Name></ram:SellerTradeParty>
      ${buyerNode}
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      ${o.omit === 'currency' ? '' : `<ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>`}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>${totalNode()}</ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>`
  const inner =
    o.omit === 'root'
      ? '<rsm:SomethingElse/>'
      : `<rsm:CrossIndustryInvoice xmlns:rsm="urn:cii" xmlns:ram="urn:ram" xmlns:udt="urn:udt">${body}</rsm:CrossIndustryInvoice>`
  return `<?xml version="1.0" encoding="UTF-8"?>${inner}`
}

describe('parseFacturX — nominal', () => {
  it('parses a CII invoice into a canonical income transaction', () => {
    const tx = parseFacturX(ciiInvoice({}))
    expect(tx).toMatchObject({
      id: 'FA-2026-001',
      date: '2026-01-15',
      amount: 1200,
      currency: 'EUR',
      counterparty: 'Client SARL',
      category: 'facture',
      source: 'factur-x',
    })
  })

  it('reads GrandTotalAmount even with a currencyID attribute', () => {
    expect(parseFacturX(ciiInvoice({ grandTotal: '2500.00', grandTotalAttr: true })).amount).toBe(2500)
  })

  it('falls back to DuePayableAmount when GrandTotalAmount is absent', () => {
    expect(parseFacturX(ciiInvoice({ dueOnly: true, grandTotal: '1300.00' })).amount).toBe(1300)
  })

  it('takes the first value when an element is duplicated', () => {
    expect(parseFacturX(ciiInvoice({ dupTotal: true, grandTotal: '1200.00' })).amount).toBe(1200)
    expect(parseFacturX(ciiInvoice({ dupBuyer: true, buyer: 'Client SARL' })).counterparty).toBe('Client SARL')
  })
})

describe('parseFacturX — malformed / invalid', () => {
  it('rejects non-well-formed XML', () => {
    expect(() => parseFacturX('<a><b></a>')).toThrow(RangeError)
    expect(() => parseFacturX('')).toThrow(RangeError)
  })

  it.each(['root', 'id', 'currency', 'total'] as const)('rejects a document missing %s', (omit) => {
    expect(() => parseFacturX(ciiInvoice({ omit }))).toThrow(RangeError)
  })

  it('rejects a non-102 date format code', () => {
    expect(() => parseFacturX(ciiInvoice({ dateFormat: '203' }))).toThrow(/format/)
  })

  it('rejects an empty IssueDateTime', () => {
    expect(() => parseFacturX(ciiInvoice({ emptyIssueDate: true }))).toThrow(RangeError)
  })

  it('rejects a malformed issue date', () => {
    expect(() => parseFacturX(ciiInvoice({ date: '2026-01-15' }))).toThrow(RangeError)
  })

  it.each(['1e3', '0x10', '1,200.00'])('rejects a non-decimal amount %s', (grandTotal) => {
    expect(() => parseFacturX(ciiInvoice({ grandTotal }))).toThrow(RangeError)
  })

  it('rejects an empty amount node', () => {
    expect(() => parseFacturX(ciiInvoice({ grandTotalEmpty: true }))).toThrow(RangeError)
  })

  it('rejects a non-positive total (credit note)', () => {
    expect(() => parseFacturX(ciiInvoice({ grandTotal: '-500.00' }))).toThrow(/non-positive/)
  })
})

describe('importFacturX', () => {
  it('aggregates several invoices into turnover', () => {
    const txs = importFacturX(
      ciiInvoice({ id: 'FA-1', grandTotal: '1200.00' }),
      ciiInvoice({ id: 'FA-2', grandTotal: '800.00' }),
    )
    expect(txs).toHaveLength(2)
    expect(aggregateTurnover(txs, { year: 2026 }).revenue).toBe(2000)
  })

  it('de-duplicates invoices with the same id', () => {
    expect(importFacturX(ciiInvoice({ id: 'FA-9' }), ciiInvoice({ id: 'FA-9' }))).toHaveLength(1)
  })
})
