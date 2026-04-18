const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizePaymentConfirmationState, validatePaymentDraft } = require('./helpers/finance-testable.js')

test('normalizePaymentConfirmationState aceita estados válidos', () => {
  assert.equal(normalizePaymentConfirmationState('AwaitingConfirmation'), 'AwaitingConfirmation')
  assert.equal(normalizePaymentConfirmationState('Confirmed'), 'Confirmed')
})

test('normalizePaymentConfirmationState rejeita estados inválidos', () => {
  assert.throws(() => normalizePaymentConfirmationState('Rejected'), /Invalid payment confirmation status/)
})

test('validatePaymentDraft aplica defaults e aceita comprovativo https', () => {
  const draft = validatePaymentDraft({
    amount: '',
    invoiceAmount: 1250,
    method: '',
    receiptUrl: 'https://cdn.example.com/comprovativo.pdf',
    reference: ' TRX-22 ',
    notes: ' pago pelo app ',
  })

  assert.deepEqual(draft, {
    amount: 1250,
    method: 'Bank transfer',
    receiptUrl: 'https://cdn.example.com/comprovativo.pdf',
    reference: 'TRX-22',
    notes: 'pago pelo app',
  })
})

test('validatePaymentDraft rejeita amount <= 0', () => {
  assert.throws(
    () => validatePaymentDraft({ amount: 0, invoiceAmount: 0, method: 'MBWay', receiptUrl: '', reference: '', notes: '' }),
    /amount must be greater than zero/
  )
})

test('validatePaymentDraft rejeita comprovativo fora de http/https', () => {
  assert.throws(
    () => validatePaymentDraft({ amount: 80, invoiceAmount: 80, method: 'Cash', receiptUrl: 'ftp://file', reference: '', notes: '' }),
    /receiptUrl must start with http:\/\/ or https:\/\//
  )
})
