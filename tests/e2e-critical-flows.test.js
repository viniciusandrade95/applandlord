const test = require('node:test')
const assert = require('node:assert/strict')

const { parseLeaseWizardPayload, validateLeaseSchedule, validateLeaseRelations } = require('./helpers/lease-wizard-testable')
const { assertRentChargeTransitionAllowed } = require('./helpers/rent-state-machine-testable')
const { validatePaymentDraft } = require('./helpers/finance-testable')
const { applyTicketFlow } = require('./helpers/ticket-flow-testable')
const { resolveReminderTemplateName, computeRetryState } = require('./helpers/whatsapp-reminder-testable')
const { parseTenantIntent, computeInboundDedupeKey, InMemoryInboundStore, processWithIdempotency } = require('./helpers/tenant-inbound-testable')

// Fluxo 1: criação de contrato (wizard)
test('E2E fluxo crítico #1 — wizard cria payload consistente e valida agenda/relações', () => {
  const payload = parseLeaseWizardPayload({
    propertyId: 'prop_demo',
    unitId: 'unit_demo',
    renterMode: 'new',
    newRenterFullName: 'Inquilino Demo',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    monthlyRent: '950',
    dueDay: 8,
  })

  validateLeaseSchedule(payload.startDate, payload.endDate, payload.dueDay)
  validateLeaseRelations({
    unitPropertyId: 'prop_demo',
    selectedPropertyId: payload.propertyId,
    unitStatus: 'Vacant',
    activeLeaseCountForUnit: 0,
  })

  assert.equal(payload.renterMode, 'new')
  assert.equal(payload.monthlyRent, 950)
})

// Fluxo 2: cobrança + confirmação
test('E2E fluxo crítico #2 — rent charge transiciona até confirmação de pagamento', () => {
  const pendingToAwaiting = assertRentChargeTransitionAllowed({ fromStatus: 'Pending', toStatus: 'AwaitingConfirmation' })
  const awaitingToPaid = assertRentChargeTransitionAllowed({ fromStatus: pendingToAwaiting.normalizedTo, toStatus: 'Paid' })

  const paymentDraft = validatePaymentDraft({
    amount: 950,
    method: 'Transferência',
    receiptUrl: 'https://example.com/comprovativo.pdf',
    reference: 'TX-2026-04',
  })

  assert.equal(awaitingToPaid.normalizedTo, 'Paid')
  assert.equal(paymentDraft.amount, 950)
})

// Fluxo 3: ticket operacional
 test('E2E fluxo crítico #3 — ticket percorre ciclo operacional até fechamento', () => {
  const flow = applyTicketFlow('New', ['Triaged', 'Waiting', 'Resolved', 'Closed'])

  assert.equal(flow.status, 'Closed')
  assert.equal(flow.events.length, 4)
})

// Fluxo 4: reminder WhatsApp com retry
test('E2E fluxo crítico #4 — reminder overdue e retry controlado', () => {
  const template = resolveReminderTemplateName('2026-04-10', new Date('2026-04-18T00:00:00Z'))
  const firstRetry = computeRetryState(0, 3)
  const finalAttempt = computeRetryState(2, 3)

  assert.equal(template, 'rent_overdue_notice')
  assert.equal(firstRetry.status, 'RetryScheduled')
  assert.equal(finalAttempt.status, 'Failed')
})

// Fluxo 5: inbound inquilino idempotente
test('E2E fluxo crítico #5 — inbound identifica intenção e bloqueia duplicidade', async () => {
  const store = new InMemoryInboundStore()
  const dedupeKey = computeInboundDedupeKey({
    senderPhone: '+351 912 345 678',
    messageBody: 'Já paguei hoje, envio comprovativo em seguida.',
  })

  const firstRun = await processWithIdempotency({
    store,
    ownerId: 'owner_demo',
    dedupeKey,
    work: async () => parseTenantIntent('Já paguei hoje, envio comprovativo em seguida.'),
  })

  const secondRun = await processWithIdempotency({
    store,
    ownerId: 'owner_demo',
    dedupeKey,
    work: async () => parseTenantIntent('Já paguei hoje, envio comprovativo em seguida.'),
  })

  assert.equal(firstRun.duplicate, false)
  assert.equal(firstRun.value, 'tenant_claimed_paid')
  assert.equal(secondRun.duplicate, true)
})

// Fluxo 6: regressão inválida bloqueada
test('E2E fluxo crítico #6 — regressão inválida de cobrança é rejeitada', () => {
  assert.throws(
    () => assertRentChargeTransitionAllowed({ fromStatus: 'Paid', toStatus: 'Pending' }),
    /Invalid transition from Paid to Pending/,
  )
})
