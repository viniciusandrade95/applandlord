const { createHash } = require('node:crypto')

function normalizeInboundPhone(phone) {
  return String(phone ?? '').replace(/\D/g, '')
}

function parseTenantIntent(rawMessage) {
  const normalized = String(rawMessage ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!normalized) return 'unknown'

  if (
    normalized.includes('ja paguei') ||
    normalized.includes('paguei') ||
    normalized.includes('ja transferi') ||
    normalized.includes('comprovativo')
  ) {
    return 'tenant_claimed_paid'
  }

  if (normalized.includes('pago amanha') || normalized.includes('amanha pago')) {
    return 'tenant_promised_tomorrow'
  }

  const problemKeywords = ['problema', 'avaria', 'vazamento', 'fuga', 'infiltracao', 'cano', 'eletric', 'luz', 'agua', 'fechadura']
  if (problemKeywords.some((keyword) => normalized.includes(keyword))) {
    return 'tenant_problem_reported'
  }

  return 'unknown'
}

function computeInboundDedupeKey({ senderPhone, messageBody, providerMessageId }) {
  const provider = String(providerMessageId ?? '').trim()
  if (provider) return `provider:${provider}`

  const digest = createHash('sha256')
    .update(`${normalizeInboundPhone(senderPhone)}::${String(messageBody ?? '').trim().toLowerCase()}`)
    .digest('hex')

  return `hash:${digest}`
}

class InMemoryInboundStore {
  constructor() {
    this.created = new Set()
  }

  async createUnique(ownerId, dedupeKey) {
    const unique = `${ownerId}::${dedupeKey}`
    if (this.created.has(unique)) {
      return false
    }

    this.created.add(unique)
    return true
  }
}

async function processWithIdempotency({ store, ownerId, dedupeKey, work }) {
  const created = await store.createUnique(ownerId, dedupeKey)
  if (!created) {
    return { duplicate: true, value: null }
  }

  const value = await work()
  return { duplicate: false, value }
}

module.exports = {
  normalizeInboundPhone,
  parseTenantIntent,
  computeInboundDedupeKey,
  InMemoryInboundStore,
  processWithIdempotency,
}
