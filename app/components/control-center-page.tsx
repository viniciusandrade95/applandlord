'use client'

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { LeaseWizard } from '@/app/components/lease-wizard'
import { appVersion } from '@/lib/version'

type Dashboard = {
  counts: {
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
  finances: {
    monthlyConfirmedPayments: number
    monthlyExpenses: number
    monthlyNetProfit: number
    openInvoices: number
    awaitingConfirmation: number
    collectionRate: number
  }
  attention?: {
    daySummary: {
      title: string
      detail: string
      highlights: string[]
    }
    quickActions: { id: string; label: string; href: string; detail: string; tone: 'critical' | 'warning' | 'healthy' | 'info' }[]
    attentionByPriority: {
      high: { id: string; title: string; detail: string; href: string; cta: string }[]
      medium: { id: string; title: string; detail: string; href: string; cta: string }[]
      low: { id: string; title: string; detail: string; href: string; cta: string }[]
    }
    kpis: {
      id: string
      label: string
      value: number
      format: 'count' | 'currency' | 'percent'
      status: 'critical' | 'warning' | 'healthy' | 'info'
      href: string
      actionLabel: string
    }[]
  }
}

type Row = Record<string, any>

type State = {
  dashboard: Dashboard | null
  properties: Row[]
  units: Row[]
  renters: Row[]
  leases: Row[]
  invoices: Row[]
  payments: Row[]
  maintenance: Row[]
}

type Notice = { kind: 'success' | 'error'; text: string } | null
type EmptyState = { title: string; hint: string; actionLabel: string; actionHref: string }

const initialState: State = {
  dashboard: null,
  properties: [],
  units: [],
  renters: [],
  leases: [],
  invoices: [],
  payments: [],
  maintenance: [],
}

function money(value: number) {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  )
}

function date(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed)
}

function dateTime(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(parsed)
}

function periodLabel(period?: string) {
  if (!period) return '—'
  const [year, month] = period.split('-')
  const parsed = new Date(Number(year), Number(month) - 1, 1)
  if (Number.isNaN(parsed.getTime())) return period
  return new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(parsed)
}

function chipClass(value?: string) {
  const normalized = (value || '').toLowerCase()
  if (['paid', 'occupied', 'active', 'resolved', 'closed'].includes(normalized)) return 'chip chip-positive'
  if (['pending', 'partial', 'awaitingconfirmation', 'vacant', 'open', 'normal', 'new', 'waiting'].includes(normalized)) return 'chip chip-warning'
  if (['overdue', 'ended', 'urgent', 'cancelled', 'high'].includes(normalized)) return 'chip chip-danger'
  if (['triaged', 'low'].includes(normalized)) return 'chip chip-accent'
  return 'chip chip-accent'
}

const STATUS_LABELS: Record<string, string> = {
  Pending: 'Pendente',
  Overdue: 'Em atraso',
  Partial: 'Pago parcialmente',
  AwaitingConfirmation: 'A aguardar confirmação',
  Paid: 'Pago',
  Canceled: 'Cancelado',
  Cancelled: 'Cancelado',
  Active: 'Ativo',
  Ended: 'Terminado',
  Vacant: 'Vaga',
  Occupied: 'Ocupada',
  Maintenance: 'Em manutenção',
  New: 'Novo',
  Triaged: 'Em análise',
  Waiting: 'A aguardar',
  Resolved: 'Resolvido',
  Closed: 'Fechado',
  Low: 'Baixa',
  Normal: 'Normal',
  High: 'Alta',
  Urgent: 'Urgente',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  'Bank transfer': 'Transferência bancária',
  Cash: 'Dinheiro',
  Card: 'Cartão',
  'MB Way': 'MB Way',
  Stripe: 'Stripe',
}

function statusLabel(value?: string) {
  return value ? STATUS_LABELS[value] ?? value : '—'
}

function paymentMethodLabel(value?: string) {
  return value ? PAYMENT_METHOD_LABELS[value] ?? value : '—'
}

function UiIcon({ name }: { name: 'building' | 'income' | 'check' | 'tools' | 'arrow' }) {
  const paths: Record<string, ReactNode> = {
    building: <><path d="M4 21V5l8-3v19M12 8h8v13M8 7v2M8 12v2M8 17v2M16 12v2M16 17v2M2 21h20" /></>,
    income: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 21h22" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    tools: <><path d="m14 7 3-3 3 3-3 3M5 19l9-9M4 14l6 6" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  }

  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function payload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries())
}

function apiErrorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string') {
    return (data as { error: string }).error
  }

  if (data && typeof data === 'object' && 'message' in data && typeof (data as { message?: unknown }).message === 'string') {
    return (data as { message: string }).message
  }

  return fallback
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <article className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <span>{subtitle}</span>
      </div>
      <div className="card-body">{children}</div>
    </article>
  )
}

function RecordList({ items, empty, render }: { items: Row[]; empty: EmptyState; render: (row: Row) => ReactNode }) {
  if (!items.length) {
    return (
      <div className="empty">
        <strong>{empty.title}</strong>
        <p className="muted">{empty.hint}</p>
        <a className="inline-link" href={empty.actionHref}>
          {empty.actionLabel}
        </a>
      </div>
    )
  }

  return <div className="stack">{items.map(render)}</div>
}

type SetupStep = 'property' | 'unit' | 'renter'
type SetupStepStatus = 'active' | 'locked' | 'completed' | 'available'

function SetupStepCard({
  number,
  title,
  description,
  status,
  onSelect,
  href,
}: {
  number: number
  title: string
  description: string
  status: SetupStepStatus
  onSelect?: () => void
  href?: string
}) {
  const label = status === 'completed' ? 'Concluído' : status === 'locked' ? 'Bloqueado' : status === 'active' ? 'Em curso' : 'Começar'
  const content = <>
    <span className="setup-step-number">{status === 'completed' ? '✓' : number}</span>
    <span className="setup-step-copy"><strong>{title}</strong><small>{description}</small></span>
    <span className="setup-step-status">{label}</span>
  </>

  if (href && status !== 'locked') return <a className={`setup-step-card setup-step-${status}`} href={href}>{content}</a>

  return <button className={`setup-step-card setup-step-${status}`} type="button" disabled={status === 'locked'} onClick={onSelect}>{content}</button>
}

function EmptyDashboardState() {
  return <section className="empty-dashboard-state">
    <div className="empty-dashboard-illustration"><UiIcon name="building" /></div>
    <p className="screen-kicker">Vamos começar</p>
    <h2>Ainda não existem imóveis registados</h2>
    <p>Adicione o seu primeiro imóvel para acompanhar rendas, contratos, despesas e manutenção num só lugar.</p>
    <a className="dashboard-primary-action" href="/portfolio">Adicionar primeiro imóvel</a>
    <div className="empty-dashboard-benefits" aria-label="Funcionalidades disponíveis depois da configuração">
      {['Receitas mensais', 'Pagamentos em atraso', 'Taxa de ocupação', 'Despesas', 'Contratos', 'Manutenção'].map((benefit) => <span key={benefit}><UiIcon name="check" />{benefit}</span>)}
    </div>
  </section>
}

function SmartEmptyState({ title, description, actionLabel, actionHref }: { title: string; description: string; actionLabel: string; actionHref: string }) {
  return <div className="smart-empty-state">
    <div className="smart-empty-icon"><UiIcon name="check" /></div>
    <strong>{title}</strong>
    <p>{description}</p>
    <a className="button button-primary" href={actionHref}>{actionLabel}</a>
  </div>
}

/**
 * Cartão de gestão de um imóvel: mostra morada, resumo de ocupação e a lista de
 * unidades com renda, estado e inquilino ocupante (via contrato ativo).
 */
function PropertyCard({ property }: { property: Row }) {
  const units: Row[] = Array.isArray(property.units) ? (property.units as Row[]) : []
  const leases: Row[] = Array.isArray(property.leases) ? (property.leases as Row[]) : []
  const occupied = units.filter((unit) => unit.status === 'Occupied').length
  const vacant = units.filter((unit) => unit.status === 'Vacant').length
  const other = units.length - occupied - vacant
  const monthlyRent = units.reduce((sum, unit) => sum + (unit.status === 'Occupied' ? Number(unit.monthlyRent ?? 0) : 0), 0)

  return (
    <article className="card">
      <div className="card-header">
        <h2>{property.name as string}</h2>
        <span>{property.addressLine1 as string}{property.city ? `, ${property.city as string}` : ''}</span>
      </div>
      <div className="card-body">
        <div className="chips" style={{ marginBottom: 14 }}>
          <span className="chip chip-accent">{units.length} {units.length === 1 ? 'unidade' : 'unidades'}</span>
          {occupied ? <span className="chip chip-positive">{occupied} ocupada{occupied === 1 ? '' : 's'}</span> : null}
          {vacant ? <span className="chip chip-warning">{vacant} vaga{vacant === 1 ? '' : 's'}</span> : null}
          {other > 0 ? <span className="chip chip-accent">{other} em manutenção</span> : null}
          {monthlyRent ? <span className="chip chip-accent">{money(monthlyRent)}/mês</span> : null}
        </div>
        {units.length ? (
          <div className="stack">
            {units.map((unit) => {
              const tenant = leases.find((lease) => lease.unitId === unit.id && lease.status === 'Active')?.renter?.fullName as string | undefined
              return (
                <div key={unit.id as string} className="unit-row">
                  <div>
                    <strong>{unit.name as string}</strong>
                    <span className="muted">{money(Number(unit.monthlyRent ?? 0))} · {tenant ?? 'Sem inquilino'}</span>
                  </div>
                  <span className={chipClass(unit.status as string)}>{statusLabel(unit.status as string)}</span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="muted">Ainda sem unidades neste imóvel.</p>
        )}
      </div>
    </article>
  )
}

type ControlCenterMode = 'all' | 'dashboard' | 'portfolio' | 'leases' | 'billing' | 'operations'

export function ControlCenterPage({ mode = 'all' }: { mode?: ControlCenterMode }) {
  const [state, setState] = useState<State>(initialState)
  const [notice, setNotice] = useState<Notice>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('')
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState<string>('')
  const [ticketPropertyId, setTicketPropertyId] = useState<string>('')
  const [setupStep, setSetupStep] = useState<SetupStep | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const endpoints = ['/api/dashboard', '/api/properties', '/api/units', '/api/renters', '/api/leases', '/api/invoices', '/api/payments', '/api/tickets']
      const responses = await Promise.all(endpoints.map((endpoint) => fetch(endpoint)))
      const data = await Promise.all(
        responses.map(async (response) => {
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(apiErrorMessage(body, 'Não foi possível carregar os dados do painel.'))
          return body
        })
      )

      setState({ dashboard: data[0], properties: data[1], units: data[2], renters: data[3], leases: data[4], invoices: data[5], payments: data[6], maintenance: data[7] })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar painel do senhorio.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function postJson(endpoint: string, body: Record<string, unknown>, message: string, method = 'POST') {
    if (submitting) return

    setSubmitting(endpoint)
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
      setNotice({ kind: 'success', text: message })
      await load()
    } finally {
      setSubmitting(null)
    }
  }

  async function sendInvoiceViaWhatsApp(invoice: Row) {
    const invoiceId = typeof invoice.id === 'string' ? invoice.id : ''
    const tenantId =
      typeof invoice.lease?.renter?.id === 'string' ? (invoice.lease.renter.id as string) : ''

    if (!invoiceId || !tenantId) {
      setNotice({ kind: 'error', text: 'Não foi possível identificar a fatura ou o inquilino para envio.' })
      return
    }

    setSendingInvoiceId(invoiceId)

    try {
      const response = await fetch('/api/whatsapp/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, invoiceId }),
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível enviar a mensagem de cobrança.'))

      setNotice({ kind: 'success', text: data?.detail || 'Mensagem enviada por WhatsApp.' })
    } catch (error) {
      setNotice({
        kind: 'error',
        text: error instanceof Error ? error.message : 'Falha ao enviar mensagem',
      })
    } finally {
      setSendingInvoiceId(null)
    }
  }

  const dashboard = state.dashboard
  const counts = dashboard?.counts
  const finances = dashboard?.finances
  const attention = dashboard?.attention
  const activeLeaseCount = counts?.activeLeases ?? state.leases.filter((lease) => lease.status === 'Active').length
  const propertyOptions = useMemo(() => state.properties.map((property) => ({ id: property.id as string, label: property.name as string })), [state.properties])
  const unitOptions = useMemo(
    () => state.units.map((unit) => ({ id: unit.id as string, propertyId: unit.propertyId as string, label: `${unit.name as string} · ${(unit.property?.name as string) ?? 'Imóvel'}` })),
    [state.units]
  )
  const renterOptions = useMemo(() => state.renters.map((renter) => ({ id: renter.id as string, label: renter.fullName as string })), [state.renters])
  const invoiceOptions = useMemo(
    () => state.invoices.filter((invoice) => invoice.status !== 'Paid').map((invoice) => ({
      id: invoice.id as string,
      label: `${periodLabel(invoice.period as string)} · ${(invoice.lease?.renter?.fullName as string) ?? 'Inquilino'} · ${money(Number(invoice.amount ?? 0))}`,
    })),
    [state.invoices]
  )
  const filteredTickets = useMemo(() => state.maintenance.filter((ticket) => {
    const byStatus = ticketStatusFilter ? (ticket.status as string) === ticketStatusFilter : true
    const byPriority = ticketPriorityFilter ? (ticket.priority as string) === ticketPriorityFilter : true
    return byStatus && byPriority
  }), [state.maintenance, ticketStatusFilter, ticketPriorityFilter])

  const showDashboard = mode === 'all' || mode === 'dashboard'
  const showPortfolio = mode === 'all' || mode === 'portfolio'
  const showLeases = mode === 'all' || mode === 'leases'
  const showBilling = mode === 'all' || mode === 'billing'
  const showOperations = mode === 'all' || mode === 'operations'
  // Em páginas de modo único o título da secção é o h1 da página; no painel combinado fica h2 sob o h1 do dashboard.
  const SectionHeading = mode === 'all' || mode === 'dashboard' ? 'h2' : 'h1'
  const occupancyRate = counts?.units ? Math.round(((counts.occupiedUnits ?? 0) / counts.units) * 100) : 0
  const dashboardAlerts = [
    ...(attention?.attentionByPriority?.high ?? []),
    ...(attention?.attentionByPriority?.medium ?? []),
  ].slice(0, 3)
  const setupComplete = propertyOptions.length > 0 && unitOptions.length > 0 && renterOptions.length > 0
  // Durante o onboarding, guia automaticamente até ao próximo passo em falta.
  // Com o portfólio já configurado, só abre um formulário quando o utilizador escolhe adicionar algo.
  const currentSetupStep: SetupStep | null = setupComplete
    ? setupStep
    : (setupStep ?? (!propertyOptions.length ? 'property' : !unitOptions.length ? 'unit' : !renterOptions.length ? 'renter' : null))

  return (
    <main className="app-shell" id="conteudo-principal" tabIndex={-1}>
      {/* Regiões vivas persistentes: aparecem em todas as páginas e são anunciadas por leitores de ecrã */}
      <div className="notice-region">
        <div role="status" aria-live="polite" aria-atomic="true">
          {notice?.kind === 'success' ? <div className="notice notice-success">{notice.text}</div> : null}
        </div>
        <div role="alert" aria-live="assertive" aria-atomic="true">
          {notice?.kind === 'error' ? <div className="notice notice-error">{notice.text}</div> : null}
        </div>
      </div>
      {showDashboard ? <>
        <header className="mobile-dashboard-header">
          <div>
            <p className="screen-kicker">Resumo dos seus imóveis</p>
            <h1>Painel geral</h1>
          </div>
          <button
            className="session-button"
            type="button"
            aria-label="Terminar sessão"
            title="Terminar sessão"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
          >
            Sair
          </button>
        </header>

        {!loading && state.properties.length === 0 ? <EmptyDashboardState /> : <>
        <section className={`wellbeing-card ${(counts?.overdueInvoices ?? 0) > 0 ? 'wellbeing-card-warning' : ''}`}>
          <div className="wellbeing-icon"><UiIcon name="check" /></div>
          <div>
            <span>{loading ? 'A atualizar informação' : (counts?.overdueInvoices ?? 0) > 0 ? 'Precisa da sua atenção' : 'Tudo em ordem'}</span>
            <strong>{attention?.daySummary.title ?? 'Estamos a preparar o seu resumo.'}</strong>
          </div>
        </section>

        <section className="senior-kpi-grid" aria-label="Resumo principal">
          <a className="senior-kpi-card" href="/portfolio">
            <span className="kpi-icon kpi-icon-blue"><UiIcon name="building" /></span>
            <span className="kpi-label">Imóveis</span>
            <strong>{counts?.properties ?? 0}</strong>
            <small>{counts?.vacantUnits ? `${counts.vacantUnits} unidades vagas` : 'Todos acompanhados'}</small>
          </a>
          <a className="senior-kpi-card" href="/billing">
            <span className="kpi-icon kpi-icon-green"><UiIcon name="income" /></span>
            <span className="kpi-label">Recebido</span>
            <strong>{finances ? money(finances.monthlyConfirmedPayments) : '€0'}</strong>
            <small>Este mês</small>
          </a>
          <a className="senior-kpi-card" href="/billing">
            <span className="kpi-icon kpi-icon-green"><UiIcon name="check" /></span>
            <span className="kpi-label">Pagamentos</span>
            <strong>{counts?.overdueInvoices ? `${counts.overdueInvoices} em atraso` : 'Em dia'}</strong>
            <small>{finances?.awaitingConfirmation ?? 0} por confirmar</small>
          </a>
          <a className="senior-kpi-card" href="/operations">
            <span className="kpi-icon kpi-icon-orange"><UiIcon name="tools" /></span>
            <span className="kpi-label">Manutenção</span>
            <strong>{counts?.openMaintenance ?? 0}</strong>
            <small>{counts?.openMaintenance ? 'Pedidos pendentes' : 'Tudo em ordem'}</small>
          </a>
        </section>

        <section className="dashboard-overview-grid">
          <article className="dashboard-simple-card occupancy-card">
            <div className="simple-card-heading">
              <div><span>Ocupação</span><strong>Estado dos imóveis</strong></div>
              <a href="/portfolio">Ver todos</a>
            </div>
            <div className="occupancy-content">
              <div className="occupancy-ring" style={{ background: `conic-gradient(#1f9d67 ${occupancyRate * 3.6}deg, #e8edf2 0deg)` }}>
                <div><strong>{occupancyRate}%</strong><span>ocupado</span></div>
              </div>
              <div className="occupancy-legend">
                <span><i className="legend-dot legend-green" />Ocupadas <strong>{counts?.occupiedUnits ?? 0}</strong></span>
                <span><i className="legend-dot legend-gray" />Vagas <strong>{counts?.vacantUnits ?? 0}</strong></span>
              </div>
            </div>
          </article>

          <article className="dashboard-simple-card finance-summary-card">
            <div className="simple-card-heading">
              <div><span>Finanças</span><strong>Resumo deste mês</strong></div>
              <a href="/billing">Detalhes</a>
            </div>
            <dl className="finance-summary-list">
              <div><dt>Receita recebida</dt><dd className="positive-value">{finances ? money(finances.monthlyConfirmedPayments) : '€0'}</dd></div>
              <div><dt>Despesas</dt><dd>{finances ? money(finances.monthlyExpenses) : '€0'}</dd></div>
              <div><dt>Saldo líquido</dt><dd>{finances ? money(finances.monthlyNetProfit) : '€0'}</dd></div>
            </dl>
          </article>
        </section>

        <section className="dashboard-simple-card dashboard-alerts">
          <div className="simple-card-heading">
            <div><span>Próximos passos</span><strong>{dashboardAlerts.length ? 'Precisa da sua atenção' : 'Não há tarefas urgentes'}</strong></div>
          </div>
          <div className="friendly-list">
            {dashboardAlerts.map((item) => (
              <a key={item.id} href={item.href} className="friendly-list-item">
                <span className="friendly-list-status" />
                <span><strong>{item.title}</strong><small>{item.cta}</small></span>
                <UiIcon name="arrow" />
              </a>
            ))}
            {!dashboardAlerts.length ? <div className="friendly-empty"><UiIcon name="check" /><span><strong>Está tudo bem com os seus imóveis.</strong><small>Voltaremos a avisar quando houver algo importante.</small></span></div> : null}
          </div>
        </section>

        <section className="dashboard-simple-card property-preview-card">
          <div className="simple-card-heading">
            <div><span>Os seus imóveis</span><strong>Visão rápida</strong></div>
            <a href="/portfolio">Ver todos</a>
          </div>
          <div className="friendly-list">
            {state.properties.slice(0, 3).map((property) => {
              const propertyUnits = state.units.filter((unit) => unit.propertyId === property.id)
              const vacant = propertyUnits.filter((unit) => unit.status === 'Vacant').length
              return <a key={property.id} href="/portfolio" className="friendly-list-item property-preview-item">
                <span className="property-avatar"><UiIcon name="building" /></span>
                <span><strong>{property.name as string}</strong><small>{property.addressLine1 as string}, {property.city as string}</small></span>
                <span className={`friendly-status ${vacant ? 'friendly-status-warning' : ''}`}>{vacant ? `${vacant} vaga` : 'Em dia'}</span>
                <UiIcon name="arrow" />
              </a>
            })}
            {!state.properties.length ? <div className="friendly-empty"><UiIcon name="building" /><span><strong>Adicione o seu primeiro imóvel.</strong><small>Leva apenas alguns minutos.</small></span></div> : null}
          </div>
          <a className="dashboard-primary-action" href="/portfolio">Adicionar imóvel</a>
        </section>
        </>}
      </> : null}

      {showPortfolio ? <section className="section" id="cadastros">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">{setupComplete ? 'Os seus imóveis' : 'Configuração do portfólio'}</SectionHeading>
            <p>{setupComplete ? 'A sua carteira de imóveis, unidades e ocupação num só lugar.' : 'Complete estes passos pela ordem indicada. Mostramos apenas o que precisa em cada momento.'}</p>
          </div>
          {setupComplete && !currentSetupStep
            ? <button className="button button-primary" type="button" onClick={() => setSetupStep('property')}>Adicionar imóvel</button>
            : loading ? <span className="pill pill-soft">A atualizar...</span> : <span className="pill pill-positive">Tudo atualizado</span>}
        </div>

        {!setupComplete ? (
        <div className="setup-progress" aria-label="Passos de configuração">
          <SetupStepCard number={1} title="Registar imóvel" description="Morada e dados principais." status={propertyOptions.length ? 'completed' : currentSetupStep === 'property' ? 'active' : 'available'} onSelect={() => setSetupStep('property')} />
          <SetupStepCard number={2} title="Criar unidade" description={propertyOptions.length ? 'Defina renda e ocupação.' : 'Disponível depois do primeiro imóvel.'} status={!propertyOptions.length ? 'locked' : unitOptions.length ? 'completed' : currentSetupStep === 'unit' ? 'active' : 'available'} onSelect={() => setSetupStep('unit')} />
          <SetupStepCard number={3} title="Adicionar inquilino" description={unitOptions.length ? 'Registe os dados de contacto.' : 'Disponível depois da primeira unidade.'} status={!unitOptions.length ? 'locked' : renterOptions.length ? 'completed' : currentSetupStep === 'renter' ? 'active' : 'available'} onSelect={() => setSetupStep('renter')} />
          <SetupStepCard number={4} title="Criar contrato" description={renterOptions.length ? 'Associe imóvel, unidade e inquilino.' : 'Disponível depois do primeiro inquilino.'} status={!renterOptions.length ? 'locked' : state.leases.length ? 'completed' : 'available'} href="/leases" />
        </div>
        ) : null}

        {setupComplete && !currentSetupStep ? (
        <>
          <div className="chips portfolio-summary">
            <span className="chip chip-accent">{state.properties.length} {state.properties.length === 1 ? 'imóvel' : 'imóveis'}</span>
            <span className="chip chip-accent">{state.units.length} {state.units.length === 1 ? 'unidade' : 'unidades'}</span>
            {state.units.filter((unit) => unit.status === 'Occupied').length ? <span className="chip chip-positive">{state.units.filter((unit) => unit.status === 'Occupied').length} ocupadas</span> : null}
            {state.units.filter((unit) => unit.status === 'Vacant').length ? <span className="chip chip-warning">{state.units.filter((unit) => unit.status === 'Vacant').length} vagas</span> : null}
            {state.units.filter((unit) => unit.status !== 'Occupied' && unit.status !== 'Vacant').length ? <span className="chip chip-accent">{state.units.filter((unit) => unit.status !== 'Occupied' && unit.status !== 'Vacant').length} em manutenção</span> : null}
          </div>
          <div className="grid-2">
            {state.properties.map((property) => <PropertyCard key={property.id as string} property={property} />)}
          </div>
          <p className="meta">Quer registar uma unidade num imóvel existente? <button className="inline-link" type="button" onClick={() => setSetupStep('unit')}>Adicionar unidade</button></p>
        </>
        ) : null}

        {setupComplete && currentSetupStep ? <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setSetupStep(null)}>← Voltar aos imóveis</button></div> : null}

        <div className="setup-form-layout">
          {currentSetupStep === 'property' ?
          <Panel title="Imóveis" subtitle={`${propertyOptions.length} registados`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/properties', payload(form), 'Imóvel registado com sucesso. Agora pode criar a primeira unidade.') ; form.reset(); setSetupStep(setupComplete ? null : 'unit') } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o imóvel.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="property-name">Nome</label><input id="property-name" name="name" required /></div>
                <div className="field"><label htmlFor="property-address1">Endereço</label><input id="property-address1" name="addressLine1" autoComplete="address-line1" required /></div>
                <div className="field"><label htmlFor="property-city">Cidade</label><input id="property-city" name="city" autoComplete="address-level2" required /></div>
                <div className="field"><label htmlFor="property-region">Região</label><input id="property-region" name="region" autoComplete="address-level1" required /></div>
                <div className="field"><label htmlFor="property-postal">Código postal</label><input id="property-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" required /></div>
                <div className="field"><label htmlFor="property-country">País</label><input id="property-country" name="country" autoComplete="country-name" defaultValue="Portugal" /></div>
                <div className="field field-full"><label htmlFor="property-description">Descrição</label><textarea id="property-description" name="description" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/properties'}>{submitting === '/api/properties' ? 'A criar...' : 'Criar imóvel'}</button></div>
            </form>
            <RecordList items={state.properties} empty={{ title: 'Ainda não existem imóveis registados.', hint: 'Registe o primeiro imóvel para desbloquear unidades, contratos e cobranças.', actionLabel: 'Registar primeiro imóvel', actionHref: '#property-name' }} render={(property) => (
              <div key={property.id} className="empty">
                <strong>{property.name as string}</strong><br />
                <span className="muted">{property.addressLine1 as string}, {(property.city as string) ?? ''}</span>
              </div>
            )} />
          </Panel>
          : null}
          {currentSetupStep === 'unit' ?
          <Panel title="Unidades" subtitle={`${unitOptions.length} registadas`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/units', payload(form), 'Unidade registada com sucesso. Agora pode adicionar o inquilino.') ; form.reset(); setSetupStep(setupComplete ? null : 'renter') } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar a unidade.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="unit-property">Imóvel</label><select id="unit-property" name="propertyId" required defaultValue=""><option value="" disabled>Selecionar</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field"><label htmlFor="unit-name">Nome</label><input id="unit-name" name="name" required /></div>
                <div className="field"><label htmlFor="unit-rent">Renda mensal</label><input id="unit-rent" name="monthlyRent" type="number" step="0.01" required /></div>
                <div className="field"><label htmlFor="unit-status">Estado</label><select id="unit-status" name="status" defaultValue="Vacant"><option value="Vacant">Vaga</option><option value="Occupied">Ocupada</option><option value="Maintenance">Em manutenção</option></select></div>
                <div className="field"><label htmlFor="unit-bedrooms">Quartos</label><input id="unit-bedrooms" name="bedrooms" type="number" step="1" /></div>
                <div className="field"><label htmlFor="unit-bathrooms">Casas de banho</label><input id="unit-bathrooms" name="bathrooms" type="number" step="0.5" /></div>
                <div className="field field-full"><label htmlFor="unit-notes">Notas</label><textarea id="unit-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={propertyOptions.length === 0 || submitting === '/api/units'}>{submitting === '/api/units' ? 'A criar...' : 'Criar unidade'}</button></div>
            </form>
            <RecordList items={state.units} empty={{ title: 'Ainda não existem unidades registadas.', hint: 'Depois de criar o imóvel, registe cada unidade para permitir contratos e cobrança mensal.', actionLabel: 'Registar unidade', actionHref: '#unit-property' }} render={(unit) => (
              <div key={unit.id} className="empty">
                <strong>{unit.name as string}</strong><br />
                <span className="muted">{unit.property?.name ?? '—'} · {money(Number(unit.monthlyRent ?? 0))}</span><br />
                <span className={chipClass(unit.status as string)}>{statusLabel(unit.status as string)}</span>
              </div>
            )} />
          </Panel>
          : null}

          {currentSetupStep === 'renter' ?
          <Panel title="Inquilinos" subtitle={`${renterOptions.length} registados`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/renters', payload(form), 'Inquilino registado com sucesso.') ; form.reset(); setSetupStep(null) } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o inquilino.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="renter-name">Nome completo</label><input id="renter-name" name="fullName" autoComplete="name" required /></div>
                <div className="field"><label htmlFor="renter-email">Email</label><input id="renter-email" name="email" type="email" autoComplete="email" inputMode="email" /></div>
                <div className="field"><label htmlFor="renter-phone">Telefone</label><input id="renter-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" /></div>
                <div className="field field-full"><label htmlFor="renter-id">Documento / NIF</label><input id="renter-id" name="governmentId" /></div>
                <div className="field field-full"><label htmlFor="renter-notes">Notas</label><textarea id="renter-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/renters'}>{submitting === '/api/renters' ? 'A criar...' : 'Criar inquilino'}</button></div>
            </form>
            <RecordList items={state.renters} empty={{ title: 'Ainda não existem inquilinos registados.', hint: 'Adicione um inquilino agora para acelerar a criação do próximo contrato.', actionLabel: 'Registar inquilino', actionHref: '#renter-name' }} render={(renter) => (
              <div key={renter.id} className="empty">
                <strong>{renter.fullName as string}</strong><br />
                <span className="muted">{renter.email ? (renter.email as string) : 'Sem email'} · {renter.phone ? (renter.phone as string) : 'Sem telefone'}</span>
              </div>
            )} />
          </Panel>
          : null}
        </div>
      </section> : null}

      {showLeases ? <section className="section" id="contratos">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">Contratos de arrendamento</SectionHeading>
            <p>Ligue imóvel, unidade e inquilino com validações guiadas para reduzir erros de operação.</p>
          </div>
          <span className="pill pill-soft">Ativos: {activeLeaseCount}</span>
        </div>
        <div className="grid-2">
          <Panel title="Criar contrato" subtitle="Wizard guiado em 5 passos">
            <LeaseWizard
              propertyOptions={propertyOptions}
              unitOptions={unitOptions}
              renterOptions={renterOptions}
              submitting={submitting}
              setNotice={setNotice}
              onSubmit={postJson}
            />
          </Panel>

          <Panel title="Contratos ativos" subtitle="Visão rápida do portfólio">
            <RecordList items={state.leases} empty={{ title: 'Ainda não existem contratos ativos.', hint: 'Use o wizard ao lado para fechar o primeiro contrato e iniciar a cobrança mensal.', actionLabel: 'Abrir wizard de contrato', actionHref: '#contratos' }} render={(lease) => (
              <div key={lease.id} className="empty">
                <strong>{lease.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{lease.property?.name ?? '—'} · {lease.unit?.name ?? '—'} · {money(Number(lease.monthlyRent ?? 0))}</span><br />
                <span className={chipClass(lease.status as string)}>{statusLabel(lease.status as string)}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section> : null}
      {showBilling ? <section className="section" id="financeiro">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">Cobrança e pagamentos</SectionHeading>
            <p>Emita cobranças mensais e confirme pagamentos com uma linguagem clara para o dia a dia do senhorio.</p>
          </div>
          <span className="pill pill-soft">A receber: {finances ? money(finances.openInvoices) : '€0'}</span>
        </div>
        <div className="grid-2">
          <Panel title="Gerar cobranças" subtitle="Cobrança mensal automática">
            {activeLeaseCount === 0 ? <SmartEmptyState title="Ainda não existem contratos ativos" description="Crie um contrato antes de gerar as cobranças mensais." actionLabel="Criar contrato" actionHref="/leases" /> : <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/invoices/generate', payload(form), 'Cobranças criadas. Já pode acompanhar e enviar lembretes aos inquilinos.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar as cobranças.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="invoice-period">Período</label><input id="invoice-period" name="period" type="month" defaultValue={new Date().toISOString().slice(0, 7)} /></div>
                <div className="information-tile"><span>Contratos ativos</span><strong>{activeLeaseCount}</strong><small>Disponíveis para cobrança</small></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/invoices/generate'}>{submitting === '/api/invoices/generate' ? 'A gerar...' : `Gerar cobranças de ${periodLabel(new Date().toISOString().slice(0, 7))}`}</button></div>
            </form>}
            {activeLeaseCount > 0 || state.invoices.length > 0 ? <RecordList items={state.invoices} empty={{ title: 'Ainda não existem cobranças.', hint: 'Escolha o período e gere as cobranças para os contratos ativos.', actionLabel: 'Gerar cobranças agora', actionHref: '#invoice-period' }} render={(invoice) => (
              <div key={invoice.id} className="empty">
                <strong>{invoice.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{periodLabel(invoice.period as string)} · {money(Number(invoice.amount ?? 0))}</span><br />
                <span className={chipClass(invoice.status as string)}>{statusLabel(invoice.status as string)}</span>
                <div className="table-actions" style={{ marginTop: 10 }}>
                  <button
                    className="small-button"
                    type="button"
                    disabled={!invoice.lease?.renter?.phone || sendingInvoiceId === invoice.id}
                    onClick={() => {
                      if (window.confirm('Enviar lembrete por WhatsApp? O inquilino receberá os dados desta cobrança.')) {
                        void sendInvoiceViaWhatsApp(invoice)
                      }
                    }}
                  >
                    {sendingInvoiceId === invoice.id
                      ? 'A enviar...'
                      : invoice.lease?.renter?.phone
                        ? 'Enviar por WhatsApp'
                        : 'Sem telefone'}
                  </button>
                </div>
              </div>
            )} /> : null}
          </Panel>

          <Panel title="Registar pagamento" subtitle="Confirme uma renda recebida">
            {invoiceOptions.length === 0 ? <SmartEmptyState title="Não existem cobranças por receber" description="Quando existir uma cobrança em aberto, poderá registar o pagamento aqui." actionLabel="Ver contratos" actionHref="/leases" /> : <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/payments', payload(form), 'Pagamento registado. Falta apenas confirmar para entrar no resumo financeiro.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o pagamento.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="payment-invoice">Cobrança</label><select id="payment-invoice" name="invoiceId" required defaultValue=""><option value="" disabled>Selecionar cobrança</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></div>
                <div className="field"><label htmlFor="payment-amount">Valor</label><input id="payment-amount" name="amount" type="number" step="0.01" /></div>
                <div className="field"><label htmlFor="payment-method">Método</label><select id="payment-method" name="method" defaultValue="Bank transfer"><option value="Bank transfer">Transferência bancária</option><option value="Cash">Dinheiro</option><option value="Card">Cartão</option><option value="MB Way">MB Way</option><option value="Stripe">Stripe</option></select></div>
                <div className="field field-full"><label htmlFor="payment-reference">Referência</label><input id="payment-reference" name="reference" /></div>
                <div className="field field-full"><label htmlFor="payment-notes">Notas</label><textarea id="payment-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/payments'}>{submitting === '/api/payments' ? 'A registar...' : 'Registar pagamento'}</button></div>
            </form>}
            {state.payments.length > 0 ? <RecordList items={state.payments} empty={{ title: 'Ainda não existem pagamentos registados.', hint: 'Quando uma cobrança for paga, poderá registar o pagamento aqui.', actionLabel: 'Ver cobranças', actionHref: '#invoice-period' }} render={(payment) => (
              <div key={payment.id} className="empty">
                <strong>{payment.invoice?.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{dateTime(payment.paidAt)} · {money(Number(payment.amount ?? 0))} · {paymentMethodLabel(payment.method as string)}</span>
              </div>
            )} /> : null}
          </Panel>
        </div>
      </section> : null}

      {showOperations ? <section className="section" id="operacao">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">Manutenção</SectionHeading>
            <p>Crie e acompanhe pedidos de reparação dos seus imóveis.</p>
          </div>
          <span className="pill pill-soft">Pedidos: {filteredTickets.length}/{state.maintenance.length}</span>
        </div>
        <div className="grid-2">
          <Panel title="Novo pedido de manutenção" subtitle="Descreva o problema">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/tickets', payload(form), 'Pedido criado. Pode acompanhar o estado nesta área de manutenção.') ; form.reset(); setTicketPropertyId('') } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o pedido.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="ticket-title">Qual é o problema?</label><input id="ticket-title" name="title" required placeholder="Ex.: Infiltração na cozinha" /></div>
                <div className="field field-full"><label htmlFor="ticket-description">Conte-nos mais</label><textarea id="ticket-description" name="description" placeholder="Descreva o que aconteceu e quando começou." /></div>
                <div className="field"><label htmlFor="ticket-property">Onde aconteceu?</label><select id="ticket-property" name="propertyId" value={ticketPropertyId} onChange={(event) => setTicketPropertyId(event.target.value)}><option value="">Selecionar imóvel</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                {ticketPropertyId ? <div className="field"><label htmlFor="ticket-unit">Unidade</label><select id="ticket-unit" name="unitId" defaultValue=""><option value="">Sem unidade específica</option>{unitOptions.filter((unit) => unit.propertyId === ticketPropertyId).map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></div> : null}
                <div className="field"><label htmlFor="ticket-priority">Qual é a urgência?</label><select id="ticket-priority" name="priority" defaultValue="Normal"><option value="Low">Baixa</option><option value="Normal">Normal</option><option value="High">Alta</option><option value="Urgent">Urgente</option></select></div>
                <input type="hidden" name="status" value="New" />
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/tickets'}>{submitting === '/api/tickets' ? 'A criar...' : 'Criar pedido'}</button></div>
            </form>
          </Panel>

          <Panel title="Pedidos de manutenção" subtitle="Acompanhamento diário">
            {state.maintenance.length > 0 ? <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field"><label htmlFor="ticket-filter-status">Estado</label><select id="ticket-filter-status" value={ticketStatusFilter} onChange={(event) => setTicketStatusFilter(event.target.value)}><option value="">Todos</option><option value="New">Novo</option><option value="Triaged">Em análise</option><option value="Waiting">A aguardar</option><option value="Resolved">Resolvido</option><option value="Closed">Fechado</option></select></div>
              <div className="field"><label htmlFor="ticket-filter-priority">Urgência</label><select id="ticket-filter-priority" value={ticketPriorityFilter} onChange={(event) => setTicketPriorityFilter(event.target.value)}><option value="">Todas</option><option value="Low">Baixa</option><option value="Normal">Normal</option><option value="High">Alta</option><option value="Urgent">Urgente</option></select></div>
            </div> : null}
            <RecordList
              items={filteredTickets}
              empty={{
                title: state.maintenance.length ? 'Não existem pedidos com estes filtros.' : 'Ainda não existem pedidos de manutenção.',
                hint: state.maintenance.length ? 'Experimente escolher outro estado ou urgência.' : 'Quando surgir um problema num imóvel, ele aparecerá aqui.',
                actionLabel: 'Criar pedido',
                actionHref: '#ticket-title',
              }}
              render={(ticket) => (
              <div key={ticket.id} className="empty">
                <strong>{ticket.title as string}</strong><br />
                <span className="muted">{ticket.property?.name ?? 'Sem imóvel associado'} {ticket.unit?.name ? `· ${ticket.unit?.name}` : ''} {ticket.renter?.fullName ? `· ${ticket.renter?.fullName}` : ''}</span><br />
                <span className={chipClass(ticket.status as string)}>{statusLabel(ticket.status as string)}</span> <span className={chipClass(ticket.priority as string)}>{statusLabel(ticket.priority as string)}</span>
                {ticket.currentEventAt ? <p className="meta">Atualizado em {dateTime(ticket.currentEventAt as string)}</p> : null}
                <div className="form-actions" style={{ marginTop: 8 }}>
                  {ticket.status === 'New' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Triaged', note: 'Pedido analisado no painel.' }, 'Pedido marcado como em análise.', 'PATCH')}>Começar análise</button> : null}
                  {ticket.status !== 'Waiting' && ticket.status !== 'Closed' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Waiting', note: 'A aguardar fornecedor, peça ou resposta.' }, 'Pedido marcado como a aguardar.', 'PATCH')}>Marcar como a aguardar</button> : null}
                  {ticket.status !== 'Resolved' && ticket.status !== 'Closed' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Resolved', note: 'Problema resolvido.' }, 'Pedido resolvido.', 'PATCH')}>Marcar como resolvido</button> : null}
                  {ticket.status === 'Resolved' ? <button className="small-button" type="button" onClick={() => {
                    if (window.confirm('Fechar este pedido? Continuará disponível no histórico de manutenção.')) {
                      void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Closed', note: 'Encerramento confirmado.' }, 'Pedido fechado.', 'PATCH')
                    }
                  }}>Fechar pedido</button> : null}
                </div>
              </div>
              )}
            />
          </Panel>
        </div>
      </section> : null}

      <footer className="footer-note">
        <span>{loading ? 'A atualizar a sua informação...' : 'A informação está atualizada.'}</span>
        <span
          className="app-version"
          title={appVersion.buildTime ? `Build: ${appVersion.buildTime}` : undefined}
          aria-label={`Versão ${appVersion.version}, edição ${appVersion.sha}${appVersion.commitDate ? `, atualizada em ${date(appVersion.commitDate)}` : ''}`}
        >
          Versão {appVersion.version} · {appVersion.sha}
          {appVersion.commitDate ? ` · ${date(appVersion.commitDate)}` : ''}
        </span>
      </footer>
    </main>
  )
}
