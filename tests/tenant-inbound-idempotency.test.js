const test = require('node:test')
const assert = require('node:assert/strict')
const {
  parseTenantIntent,
  computeInboundDedupeKey,
  normalizeInboundPhone,
  InMemoryInboundStore,
  processWithIdempotency,
} = require('./helpers/tenant-inbound-testable.js')

test('parser identifica intencoes principais do inquilino', () => {
  assert.equal(parseTenantIntent('Já paguei hoje'), 'tenant_claimed_paid')
  assert.equal(parseTenantIntent('Pago amanhã sem falta'), 'tenant_promised_tomorrow')
  assert.equal(parseTenantIntent('Tenho problema de vazamento na cozinha'), 'tenant_problem_reported')
  assert.equal(parseTenantIntent('Bom dia'), 'unknown')
})

test('dedupe key prioriza providerMessageId quando informado', () => {
  const key = computeInboundDedupeKey({
    senderPhone: '+351 912 000 111',
    messageBody: 'ja paguei',
    providerMessageId: 'wamid.abc.123',
  })

  assert.equal(key, 'provider:wamid.abc.123')
})

test('dedupe key fallback por hash e normalizacao de telefone', () => {
  const first = computeInboundDedupeKey({ senderPhone: '+351 912-000-111', messageBody: 'Ja paguei' })
  const second = computeInboundDedupeKey({ senderPhone: '351912000111', messageBody: 'ja paguei ' })

  assert.equal(first, second)
  assert.match(first, /^hash:/)
  assert.equal(normalizeInboundPhone('+351 912-000-111'), '351912000111')
})

test('idempotencia evita duplo processamento da mesma mensagem', async () => {
  const store = new InMemoryInboundStore()
  const ownerId = 'owner-1'
  const dedupeKey = 'provider:wamid.same'

  let sideEffects = 0

  const first = await processWithIdempotency({
    store,
    ownerId,
    dedupeKey,
    work: async () => {
      sideEffects += 1
      return 'first-run'
    },
  })

  const second = await processWithIdempotency({
    store,
    ownerId,
    dedupeKey,
    work: async () => {
      sideEffects += 1
      return 'second-run'
    },
  })

  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(sideEffects, 1)
})

test('concorrencia com a mesma chave mantem apenas uma escrita efetiva', async () => {
  const store = new InMemoryInboundStore()
  const ownerId = 'owner-2'
  const dedupeKey = 'provider:wamid.concurrent'

  let sideEffects = 0

  const attempts = await Promise.all(
    Array.from({ length: 20 }).map(() =>
      processWithIdempotency({
        store,
        ownerId,
        dedupeKey,
        work: async () => {
          await new Promise((resolve) => setTimeout(resolve, 2))
          sideEffects += 1
          return 'ok'
        },
      })
    )
  )

  const processed = attempts.filter((result) => result.duplicate === false)
  const duplicates = attempts.filter((result) => result.duplicate === true)

  assert.equal(processed.length, 1)
  assert.equal(duplicates.length, 19)
  assert.equal(sideEffects, 1)
})
