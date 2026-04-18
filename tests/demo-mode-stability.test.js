const test = require('node:test')
const assert = require('node:assert/strict')

const impactData = require('../docs/demo/DEMO_IMPACT_DATA.json')
const { buildDashboardAttentionModel } = require('./helpers/dashboard-attention-testable')
const { parseLeaseWizardPayload, validateLeaseSchedule, validateLeaseRelations } = require('./helpers/lease-wizard-testable')
const { assertRentChargeTransitionAllowed } = require('./helpers/rent-state-machine-testable')
const { parseTenantIntent, computeInboundDedupeKey, InMemoryInboundStore, processWithIdempotency } = require('./helpers/tenant-inbound-testable')

test('demo dataset generates critical attention model expected for storytelling', () => {
  const model = buildDashboardAttentionModel(impactData.dashboardInput)

  assert.equal(model.attentionByPriority.high.length, 2)
  assert.equal(model.attentionByPriority.high[0].id, 'overdue-invoices')
  assert.equal(model.attentionByPriority.high[1].id, 'urgent-tickets')

  const overdueQuickAction = model.quickActions.find((item) => item.id === 'quick-charge-overdue')
  assert.equal(overdueQuickAction.tone, 'critical')

  const collectionRateKpi = model.kpis.find((item) => item.id === 'kpi-collection-rate')
  assert.equal(collectionRateKpi.status, 'healthy')
})

test('demo lease wizard scenario remains valid with expected input/output', () => {
  const payload = parseLeaseWizardPayload(impactData.contractWizardInput)

  validateLeaseSchedule(payload.startDate, payload.endDate, payload.dueDay)
  validateLeaseRelations({
    unitPropertyId: impactData.relationsValidation.unitPropertyId,
    selectedPropertyId: payload.propertyId,
    unitStatus: impactData.relationsValidation.unitStatus,
    activeLeaseCountForUnit: impactData.relationsValidation.activeLeaseCountForUnit,
  })

  assert.equal(payload.renterMode, 'new')
  assert.equal(payload.monthlyRent, 950)
  assert.equal(payload.newRenter.fullName, 'Carla Mendes')
})

test('demo rent transitions are valid and block regressions', () => {
  const transition1 = assertRentChargeTransitionAllowed({ fromStatus: 'Overdue', toStatus: 'AwaitingConfirmation' })
  assert.equal(transition1.normalizedFrom, 'Overdue')
  assert.equal(transition1.normalizedTo, 'AwaitingConfirmation')

  const transition2 = assertRentChargeTransitionAllowed({ fromStatus: 'AwaitingConfirmation', toStatus: 'Paid' })
  assert.equal(transition2.normalizedTo, 'Paid')

  assert.throws(
    () => assertRentChargeTransitionAllowed({ fromStatus: 'Paid', toStatus: 'Pending' }),
    /Invalid transition from Paid to Pending/
  )
})

test('demo inbound flow is idempotent and classifies intent', async () => {
  const body = impactData.inboundScenario.messageBody
  const intent = parseTenantIntent(body)
  assert.equal(intent, 'tenant_claimed_paid')

  const store = new InMemoryInboundStore()
  const dedupeKey = computeInboundDedupeKey(impactData.inboundScenario)

  const first = await processWithIdempotency({
    store,
    ownerId: impactData.inboundScenario.ownerId,
    dedupeKey,
    work: async () => ({ status: 'processed' }),
  })

  const second = await processWithIdempotency({
    store,
    ownerId: impactData.inboundScenario.ownerId,
    dedupeKey,
    work: async () => ({ status: 'processed-again' }),
  })

  assert.equal(first.duplicate, false)
  assert.equal(first.value.status, 'processed')
  assert.equal(second.duplicate, true)
  assert.equal(second.value, null)
})
