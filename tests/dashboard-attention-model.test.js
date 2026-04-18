const test = require('node:test')
const assert = require('node:assert/strict')
const { buildDashboardAttentionModel } = require('./helpers/dashboard-attention-testable.js')

function baseInput() {
  return {
    counts: {
      properties: 3,
      units: 10,
      occupiedUnits: 8,
      vacantUnits: 2,
      renters: 8,
      leases: 8,
      activeLeases: 8,
      overdueInvoices: 3,
      openMaintenance: 4,
    },
    finances: {
      monthlyConfirmedPayments: 10000,
      monthlyExpenses: 3000,
      monthlyNetProfit: 7000,
      openInvoices: 2500,
      awaitingConfirmation: 2,
      collectionRate: 80,
    },
    dueTodayInvoices: 2,
    urgentMaintenance: 1,
    expiringLeasesIn7Days: 1,
  }
}

test('modelo entrega 5 ações rápidas e 8 KPIs acionáveis', () => {
  const model = buildDashboardAttentionModel(baseInput())
  assert.equal(model.quickActions.length, 5)
  assert.equal(model.kpis.length, 8)
})

test('prioridade alta inclui atraso e ticket urgente quando presentes', () => {
  const model = buildDashboardAttentionModel(baseInput())
  const highIds = model.attentionByPriority.high.map((item) => item.id)
  assert.deepEqual(highIds, ['overdue-invoices', 'urgent-tickets'])
})

test('fallback de UI inclui item neutro quando não há pendências', () => {
  const input = baseInput()
  input.counts.overdueInvoices = 0
  input.counts.openMaintenance = 0
  input.counts.vacantUnits = 0
  input.finances.awaitingConfirmation = 0
  input.dueTodayInvoices = 0
  input.urgentMaintenance = 0
  input.expiringLeasesIn7Days = 0
  const model = buildDashboardAttentionModel(input)
  assert.equal(model.attentionByPriority.low[0].id, 'no-critical-attention')
})

test('estado de KPI reage a risco financeiro', () => {
  const input = baseInput()
  input.finances.monthlyNetProfit = -50
  input.finances.collectionRate = 60
  const model = buildDashboardAttentionModel(input)
  const net = model.kpis.find((item) => item.id === 'kpi-net-profit')
  const rate = model.kpis.find((item) => item.id === 'kpi-collection-rate')
  assert.equal(net?.status, 'critical')
  assert.equal(rate?.status, 'critical')
})
