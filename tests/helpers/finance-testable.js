function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function asString(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : fallback
}

const PAYMENT_CONFIRMATION_STATES = ['AwaitingConfirmation', 'Confirmed']

function normalizePaymentConfirmationState(status) {
  const normalized = String(status ?? '').trim()
  if (!PAYMENT_CONFIRMATION_STATES.includes(normalized)) {
    throw new Error(`Invalid payment confirmation status: ${status}`)
  }

  return normalized
}

function validatePaymentDraft(input) {
  const amount = asNumber(input.amount, input.invoiceAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be greater than zero')
  }

  const method = asString(input.method, 'Bank transfer')
  if (!method) {
    throw new Error('method is required')
  }

  const receiptUrl = asString(input.receiptUrl) || null
  if (receiptUrl && !/^https?:\/\//i.test(receiptUrl)) {
    throw new Error('receiptUrl must start with http:// or https://')
  }

  return {
    amount,
    method,
    receiptUrl,
    reference: asString(input.reference) || null,
    notes: asString(input.notes) || null,
  }
}

module.exports = { normalizePaymentConfirmationState, validatePaymentDraft }
