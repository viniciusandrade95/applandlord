export type DashboardCounts = {
  properties: number
  units: number
  occupiedUnits: number
  vacantUnits: number
  renters: number
  leases: number
  activeLeases: number
  overdueInvoices: number
  openMaintenance: number
}

export type DashboardFinances = {
  monthlyConfirmedPayments: number
  monthlyExpenses: number
  monthlyNetProfit: number
  openInvoices: number
  awaitingConfirmation: number
  collectionRate: number
}

export type DashboardAttentionInput = {
  counts: DashboardCounts
  finances: DashboardFinances
  dueTodayInvoices: number
  urgentMaintenance: number
  expiringLeasesIn7Days: number
}

export type AttentionPriority = 'high' | 'medium' | 'low'

export type AttentionItem = {
  id: string
  priority: AttentionPriority
  title: string
  detail: string
  href: string
  cta: string
}

export type DashboardKpi = {
  id: string
  label: string
  value: number
  format: 'count' | 'currency' | 'percent'
  status: 'critical' | 'warning' | 'healthy' | 'info'
  href: string
  actionLabel: string
}

export type QuickAction = {
  id: string
  label: string
  href: string
  detail: string
  tone: 'critical' | 'warning' | 'healthy' | 'info'
}

export type DashboardAttentionModel = {
  generatedAt: string
  daySummary: {
    title: string
    detail: string
    highlights: string[]
  }
  quickActions: QuickAction[]
  attentionByPriority: {
    high: AttentionItem[]
    medium: AttentionItem[]
    low: AttentionItem[]
  }
  kpis: DashboardKpi[]
}

function plural(value: number, singular: string, pluralValue: string) {
  return value === 1 ? singular : pluralValue
}

/**
 * Objetivo: construir um modelo de atenção diária acionável para o dashboard principal.
 *
 * Parâmetros de entrada:
 * - input.counts: agregados operacionais consolidados do tenant autenticado.
 * - input.finances: agregados financeiros do mês corrente.
 * - input.dueTodayInvoices: quantidade de cobranças que vencem hoje (UTC).
 * - input.urgentMaintenance: quantidade de tickets com prioridade urgent/high e não resolvidos.
 * - input.expiringLeasesIn7Days: contratos ativos com fim em até 7 dias.
 *
 * Validações:
 * - números inválidos são tratados como zero para preservar renderização.
 *
 * Saída:
 * - `DashboardAttentionModel` com resumo textual, ações rápidas, fila de atenção por prioridade e 8 KPIs.
 *
 * Erros possíveis:
 * - nenhum; a função é resiliente e sempre retorna um modelo com fallback.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function buildDashboardAttentionModel(input: DashboardAttentionInput): DashboardAttentionModel {
  const overdueInvoices = Number.isFinite(input.counts.overdueInvoices) ? input.counts.overdueInvoices : 0
  const dueTodayInvoices = Number.isFinite(input.dueTodayInvoices) ? input.dueTodayInvoices : 0
  const awaitingConfirmation = Number.isFinite(input.finances.awaitingConfirmation) ? input.finances.awaitingConfirmation : 0
  const urgentMaintenance = Number.isFinite(input.urgentMaintenance) ? input.urgentMaintenance : 0
  const openMaintenance = Number.isFinite(input.counts.openMaintenance) ? input.counts.openMaintenance : 0
  const vacantUnits = Number.isFinite(input.counts.vacantUnits) ? input.counts.vacantUnits : 0
  const expiringLeasesIn7Days = Number.isFinite(input.expiringLeasesIn7Days) ? input.expiringLeasesIn7Days : 0
  const monthlyNetProfit = Number.isFinite(input.finances.monthlyNetProfit) ? input.finances.monthlyNetProfit : 0
  const collectionRate = Number.isFinite(input.finances.collectionRate) ? input.finances.collectionRate : 0

  const high: AttentionItem[] = []
  const medium: AttentionItem[] = []
  const low: AttentionItem[] = []

  if (overdueInvoices > 0) {
    high.push({
      id: 'overdue-invoices',
      priority: 'high',
      title: `${overdueInvoices} ${plural(overdueInvoices, 'cobrança vencida', 'cobranças vencidas')}`,
      detail: 'Priorizar contato e renegociação para reduzir risco de inadimplência.',
      href: '#financeiro',
      cta: 'Cobrar agora',
    })
  }

  if (urgentMaintenance > 0) {
    high.push({
      id: 'urgent-tickets',
      priority: 'high',
      title: `${urgentMaintenance} ${plural(urgentMaintenance, 'ticket urgente aberto', 'tickets urgentes abertos')}`,
      detail: 'Resolver manutenção urgente evita churn e escalonamento de custo.',
      href: '#operacao',
      cta: 'Priorizar tickets',
    })
  }

  if (dueTodayInvoices > 0) {
    medium.push({
      id: 'due-today',
      priority: 'medium',
      title: `${dueTodayInvoices} ${plural(dueTodayInvoices, 'cobrança vence hoje', 'cobranças vencem hoje')}`,
      detail: 'Enviar lembrete preventivo ainda hoje aumenta chance de pagamento no prazo.',
      href: '#financeiro',
      cta: 'Enviar lembretes',
    })
  }

  if (awaitingConfirmation > 0) {
    medium.push({
      id: 'awaiting-confirmation',
      priority: 'medium',
      title: `${awaitingConfirmation} ${plural(awaitingConfirmation, 'pagamento aguardando confirmação', 'pagamentos aguardando confirmação')}`,
      detail: 'Confirmar comprovativos desbloqueia caixa real e melhora precisão dos KPIs.',
      href: '#financeiro',
      cta: 'Confirmar pagamentos',
    })
  }

  if (expiringLeasesIn7Days > 0) {
    medium.push({
      id: 'expiring-leases',
      priority: 'medium',
      title: `${expiringLeasesIn7Days} ${plural(expiringLeasesIn7Days, 'contrato expira em 7 dias', 'contratos expiram em 7 dias')}`,
      detail: 'Antecipar renovação reduz vacância e perda de receita no próximo ciclo.',
      href: '#contratos',
      cta: 'Revisar contratos',
    })
  }

  if (vacantUnits > 0) {
    low.push({
      id: 'vacant-units',
      priority: 'low',
      title: `${vacantUnits} ${plural(vacantUnits, 'unidade vaga', 'unidades vagas')}`,
      detail: 'Ative divulgação para reduzir dias vagos e melhorar ocupação.',
      href: '#cadastros',
      cta: 'Atualizar unidades',
    })
  }

  if (high.length === 0 && medium.length === 0 && low.length === 0) {
    low.push({
      id: 'no-critical-attention',
      priority: 'low',
      title: 'Sem pendências críticas no momento',
      detail: 'Painel está estável. Mantenha rotina preventiva para sustentar performance.',
      href: '#financeiro',
      cta: 'Ver detalhe financeiro',
    })
  }

  const quickActions: QuickAction[] = [
    {
      id: 'quick-charge-overdue',
      label: 'Cobrar inadimplência',
      href: '#financeiro',
      detail: overdueInvoices > 0 ? `${overdueInvoices} em atraso para tratar agora.` : 'Sem atraso crítico neste momento.',
      tone: overdueInvoices > 0 ? 'critical' : 'healthy',
    },
    {
      id: 'quick-confirm-payment',
      label: 'Confirmar pagamentos',
      href: '#financeiro',
      detail: `${awaitingConfirmation} aguardando validação manual.`,
      tone: awaitingConfirmation > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'quick-open-maintenance',
      label: 'Triar manutenção',
      href: '#operacao',
      detail: `${openMaintenance} tickets abertos (${urgentMaintenance} urgentes).`,
      tone: urgentMaintenance > 0 ? 'critical' : openMaintenance > 0 ? 'warning' : 'healthy',
    },
    {
      id: 'quick-expiring-leases',
      label: 'Renovar contratos',
      href: '#contratos',
      detail: `${expiringLeasesIn7Days} contratos vencendo em 7 dias.`,
      tone: expiringLeasesIn7Days > 0 ? 'warning' : 'info',
    },
    {
      id: 'quick-fill-vacancy',
      label: 'Reduzir vacância',
      href: '#cadastros',
      detail: `${vacantUnits} unidades vagas para atacar ocupação.`,
      tone: vacantUnits > 0 ? 'warning' : 'healthy',
    },
  ]

  const kpis: DashboardKpi[] = [
    { id: 'kpi-overdue', label: 'Cobranças em atraso', value: overdueInvoices, format: 'count', status: overdueInvoices > 0 ? 'critical' : 'healthy', href: '#financeiro', actionLabel: 'Acionar cobrança' },
    { id: 'kpi-due-today', label: 'Vencendo hoje', value: dueTodayInvoices, format: 'count', status: dueTodayInvoices > 0 ? 'warning' : 'healthy', href: '#financeiro', actionLabel: 'Enviar lembrete' },
    { id: 'kpi-awaiting', label: 'Aguardando confirmação', value: awaitingConfirmation, format: 'count', status: awaitingConfirmation > 0 ? 'warning' : 'healthy', href: '#financeiro', actionLabel: 'Confirmar comprovativos' },
    { id: 'kpi-urgent-maintenance', label: 'Tickets urgentes', value: urgentMaintenance, format: 'count', status: urgentMaintenance > 0 ? 'critical' : 'healthy', href: '#operacao', actionLabel: 'Despachar manutenção' },
    { id: 'kpi-open-maintenance', label: 'Tickets abertos', value: openMaintenance, format: 'count', status: openMaintenance > 5 ? 'warning' : 'info', href: '#operacao', actionLabel: 'Revisar fila' },
    { id: 'kpi-vacancy', label: 'Unidades vagas', value: vacantUnits, format: 'count', status: vacantUnits > 0 ? 'warning' : 'healthy', href: '#cadastros', actionLabel: 'Ativar ocupação' },
    { id: 'kpi-net-profit', label: 'Lucro líquido mensal', value: monthlyNetProfit, format: 'currency', status: monthlyNetProfit < 0 ? 'critical' : 'healthy', href: '#financeiro', actionLabel: 'Revisar margem' },
    { id: 'kpi-collection-rate', label: 'Taxa de cobrança', value: collectionRate, format: 'percent', status: collectionRate < 75 ? 'critical' : collectionRate < 90 ? 'warning' : 'healthy', href: '#financeiro', actionLabel: 'Melhorar cobrança' },
  ]

  const blockers = high.length
  const watchItems = medium.length

  return {
    generatedAt: new Date().toISOString(),
    daySummary: {
      title:
        blockers > 0
          ? `Hoje há ${blockers} ${plural(blockers, 'prioridade crítica', 'prioridades críticas')} para ação imediata.`
          : `Dia sob controle com ${watchItems} ${plural(watchItems, 'item em monitorização', 'itens em monitorização')}.`,
      detail:
        blockers > 0
          ? `Atue primeiro em inadimplência e manutenção urgente para proteger caixa e satisfação do inquilino.`
          : 'Sem alarmes críticos. Foque em prevenção, confirmações e renovação de contratos.',
      highlights: [
        `${overdueInvoices} em atraso`,
        `${awaitingConfirmation} aguardando confirmação`,
        `${urgentMaintenance} tickets urgentes`,
      ],
    },
    quickActions,
    attentionByPriority: { high, medium, low },
    kpis,
  }
}
