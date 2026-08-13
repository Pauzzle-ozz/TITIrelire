import { describe, expect, it } from 'vitest'

import { aggregateTurnover, importFacturX, parseFacturX } from '../src/index.js'

/** Builds a minimal Factur-X CII XML with overridable fields. */
function ciiInvoice(opts: {
  id?: string
  date?: string
  currency?: string
  grandTotal?: string
  grandTotalAttr?: boolean
  buyer?: string
  omit?: 'root' | 'id' | 'currency' | 'total'
}): string {
  const {
    id = 'FA-2026-001',
    date = '20260115',
    currency = 'EUR',
    grandTotal = '1200.00',
    grandTotalAttr = false,
    buyer = 'Client SARL',
  } = opts
  const total = grandTotalAttr
    ? `<ram:GrandTotalAmount currencyID="${currency}">${grandTotal}</ram:GrandTotalAmount>`
    : `<ram:GrandTotalAmount>${grandTotal}</ram:GrandTotalAmount>`
  const body = `
  <rsm:ExchangedDocument>
    ${opts.omit === 'id' ? '' : `<ram:ID>${id}</ram:ID>`}
    <ram:IssueDateTime><udt:DateTimeString format="102">${date}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty><ram:Name>Mon Entreprise</ram:Name></ram:SellerTradeParty>
      <ram:BuyerTradeParty><ram:Name>${buyer}</ram:Name></ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeSettlement>
      ${opts.omit === 'currency' ? '' : `<ram:InvoiceCurrencyCode>${currency}</ram:InvoiceCurrencyCode>`}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:TaxBasisTotalAmount>1000.00</ram:TaxBasisTotalAmount>
        ${opts.omit === 'total' ? '' : total}
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>`
  const inner =
    opts.omit === 'root'
      ? '<rsm:SomethingElse/>'
      : `<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:cii" xmlns:ram="urn:un:ram" xmlns:udt="urn:un:udt">${body}</rsm:CrossIndustryInvoice>`
  return `<?xml version="1.0" encoding="UTF-8"?>${inner}`
}

describe('parseFacturX', () => {
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
    expect(tx.label).toContain('FA-2026-001')
    expect(tx.label).toContain('Client SARL')
  })

  it('reads GrandTotalAmount even when it carries a currencyID attribute', () => {
    const tx = parseFacturX(ciiInvoice({ grandTotal: '2500.00', grandTotalAttr: true }))
    expect(tx.amount).toBe(2500)
  })

  it.each(['root', 'id', 'currency', 'total'] as const)('rejects a document missing %s', (omit) => {
    expect(() => parseFacturX(ciiInvoice({ omit }))).toThrow(RangeError)
  })

  it('rejects a malformed issue date', () => {
    expect(() => parseFacturX(ciiInvoice({ date: '2026-01-15' }))).toThrow(RangeError)
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
    const txs = importFacturX(ciiInvoice({ id: 'FA-9' }), ciiInvoice({ id: 'FA-9' }))
    expect(txs).toHaveLength(1)
  })
})
