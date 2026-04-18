function plural(value, singular, pluralValue) {
  return value === 1 ? singular : pluralValue
}

function buildDashboardAttentionModel(input) {
  const overdueInvoices = Number.isFinite(input.counts.overdueInvoices) ? input.counts.overdueInvoices : 0
  const dueTodayInvoices = Number.isFinite(input.dueTodayInvoices) ? input.dueTodayInvoices : 0
  const awaitingConfirmation = Number.isFinite(input.finances.awaitingConfirmation) ? input.finances.awaitingConfirmation : 0
  const urgentMaintenance = Number.isFinite(input.urgentMaintenance) ? input.urgentMaintenance : 0
  const openMaintenance = Number.isFinite(input.counts.openMaintenance) ? input.counts.openMaintenance : 0
  const vacantUnits = Number.isFinite(input.counts.vacantUnits) ? input.counts.vacantUnits : 0
  const expiringLeasesIn7Days = Number.isFinite(input.expiringLeasesIn7Days) ? input.expiringLeasesIn7Days : 0
  const monthlyNetProfit = Number.isFinite(input.finances.monthlyNetProfit) ? input.finances.monthlyNetProfit : 0
  const collectionRate = Number.isFinite(input.finances.collectionRate) ? input.finances.collectionRate : 0

  const high = []
  const medium = []
  const low = []

  if (overdueInvoices > 0) high.push({ id: 'overdue-invoices', title: `${overdueInvoices} ${plural(overdueInvoices, 'cobrança vencida', 'cobranças vencidas')}` })
  if (urgentMaintenance > 0) high.push({ id: 'urgent-tickets', title: `${urgentMaintenance} ${plural(urgentMaintenance, 'ticket urgente aberto', 'tickets urgentes abertos')}` })
  if (dueTodayInvoices > 0) medium.push({ id: 'due-today' })
  if (awaitingConfirmation > 0) medium.push({ id: 'awaiting-confirmation' })
  if (expiringLeasesIn7Days > 0) medium.push({ id: 'expiring-leases' })
  if (vacantUnits > 0) low.push({ id: 'vacant-units' })
  if (high.length === 0 && medium.length === 0 && low.length === 0) low.push({ id: 'no-critical-attention' })

  const quickActions = [
    { id: 'quick-charge-overdue', tone: overdueInvoices > 0 ? 'critical' : 'healthy' },
    { id: 'quick-confirm-payment', tone: awaitingConfirmation > 0 ? 'warning' : 'healthy' },
    { id: 'quick-open-maintenance', tone: urgentMaintenance > 0 ? 'critical' : openMaintenance > 0 ? 'warning' : 'healthy' },
    { id: 'quick-expiring-leases', tone: expiringLeasesIn7Days > 0 ? 'warning' : 'info' },
    { id: 'quick-fill-vacancy', tone: vacantUnits > 0 ? 'warning' : 'healthy' },
  ]

  const kpis = [
    { id: 'kpi-overdue', status: overdueInvoices > 0 ? 'critical' : 'healthy', value: overdueInvoices },
    { id: 'kpi-due-today', status: dueTodayInvoices > 0 ? 'warning' : 'healthy', value: dueTodayInvoices },
    { id: 'kpi-awaiting', status: awaitingConfirmation > 0 ? 'warning' : 'healthy', value: awaitingConfirmation },
    { id: 'kpi-urgent-maintenance', status: urgentMaintenance > 0 ? 'critical' : 'healthy', value: urgentMaintenance },
    { id: 'kpi-open-maintenance', status: openMaintenance > 5 ? 'warning' : 'info', value: openMaintenance },
    { id: 'kpi-vacancy', status: vacantUnits > 0 ? 'warning' : 'healthy', value: vacantUnits },
    { id: 'kpi-net-profit', status: monthlyNetProfit < 0 ? 'critical' : 'healthy', value: monthlyNetProfit },
    { id: 'kpi-collection-rate', status: collectionRate < 75 ? 'critical' : collectionRate < 90 ? 'warning' : 'healthy', value: collectionRate },
  ]

  return { quickActions, attentionByPriority: { high, medium, low }, kpis }
}

module.exports = { buildDashboardAttentionModel }
