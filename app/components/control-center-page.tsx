'use client'

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { LeaseWizard } from '@/app/components/lease-wizard'
import { appVersion } from '@/lib/version'
import {
  EXPENSE_CATEGORIES,
  type Notice,
  type Paged,
  type Row,
  UiIcon,
  apiErrorMessage,
  avatarColor,
  date,
  dateTime,
  initials,
  money,
  payload,
  periodLabel,
  todayISO,
} from '@/app/components/shared'

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
    overdueTotal: number
    occupiedRent: number
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

type State = {
  dashboard: Dashboard | null
  properties: Row[]
  units: Row[]
  renters: Row[]
  leases: Row[]
  invoices: Row[]
  payments: Row[]
  maintenance: Row[]
  expenses: Row[]
}

type EmptyState = { title: string; hint: string; actionLabel: string; actionHref: string }

/** Opções de selects (formulários) — carregadas à parte, limitadas a 500 (combobox assíncrono fica para P1). */
type Options = { properties: Row[]; units: Row[]; renters: Row[]; awaitingPayments: Row[] }
const emptyOptions: Options = { properties: [], units: [], renters: [], awaitingPayments: [] }

/** Info de paginação por coleção ("Ver mais"). */
type PageInfo = { nextCursor: string | null; total: number }

const initialState: State = {
  dashboard: null,
  properties: [],
  units: [],
  renters: [],
  leases: [],
  invoices: [],
  payments: [],
  maintenance: [],
  expenses: [],
}

// Estado de uma cobrança em palavra curta + tom de cor (só texto, sem pastel).
function invoiceStatusInfo(status: string): { word: string; tone: 'paid' | 'due' | 'overdue' | 'confirming' | 'muted' } {
  switch (status) {
    case 'Paid':
      return { word: 'Pago', tone: 'paid' }
    case 'Overdue':
      return { word: 'Em atraso', tone: 'overdue' }
    case 'AwaitingConfirmation':
      return { word: 'A confirmar', tone: 'confirming' }
    case 'Partial':
      return { word: 'Parcial', tone: 'due' }
    case 'Canceled':
    case 'Cancelled':
      return { word: 'Cancelada', tone: 'muted' }
    default:
      return { word: 'Por receber', tone: 'due' }
  }
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
function PropertyCard({ property, onEditProperty }: { property: Row; onEditProperty: (property: Row) => void }) {
  const units: Row[] = Array.isArray(property.units) ? (property.units as Row[]) : []
  const occupied = units.filter((unit) => unit.status === 'Occupied').length
  const vacant = units.filter((unit) => unit.status === 'Vacant').length
  const maintenance = units.length - occupied - vacant
  const monthlyRent = units.reduce((sum, unit) => sum + (unit.status === 'Occupied' ? Number(unit.monthlyRent ?? 0) : 0), 0)
  const address = (property.addressLine1 as string) || (property.name as string)
  const label = (property.name as string) && (property.name as string) !== address ? (property.name as string) : ''

  return (
    <article className="prop-card">
      <div className="prop-card-head">
        <div className="prop-card-titles">
          {label ? <span className="prop-card-label">{label}</span> : null}
          <h2>{address}</h2>
          {property.city ? <span className="prop-card-city">{property.city as string}</span> : null}
        </div>
        <button className="prop-edit" type="button" aria-label="Editar imóvel" onClick={() => onEditProperty(property)}><UiIcon name="pencil" /></button>
      </div>

      {units.length ? (
        <div className="prop-occ">
          <div className="prop-dots" role="img" aria-label={`${units.length} ${units.length === 1 ? 'unidade' : 'unidades'}, ${occupied} ocupada(s), ${vacant} livre(s)${maintenance ? `, ${maintenance} em manutenção` : ''}`}>
            {units.map((unit) => (
              <span key={unit.id as string} className={`prop-dot prop-dot-${unit.status === 'Occupied' ? 'occ' : unit.status === 'Vacant' ? 'free' : 'maint'}`} />
            ))}
          </div>
          <div className="prop-counts">
            <span className="prop-count" aria-label={`${units.length} unidades`}><UiIcon name="building" />{units.length}</span>
            <span className="prop-count prop-count-occ" aria-label={`${occupied} ocupadas`}><UiIcon name="check" />{occupied}</span>
            <span className="prop-count prop-count-free" aria-label={`${vacant} livres`}><UiIcon name="key" />{vacant}</span>
            {maintenance > 0 ? <span className="prop-count prop-count-maint" aria-label={`${maintenance} em manutenção`}><UiIcon name="tools" />{maintenance}</span> : null}
            {monthlyRent ? <span className="prop-count prop-count-rent" aria-label={`${money(monthlyRent)} por mês`}><UiIcon name="euro" />{money(monthlyRent)}</span> : null}
          </div>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>Ainda sem unidades.</p>
      )}
    </article>
  )
}

type EditingEntity = { type: SetupStep; data: Row }

/**
 * Formulário de edição para imóvel, unidade ou inquilino. Reutiliza os campos de
 * criação, pré-preenchidos, e submete via PATCH para a coleção respetiva.
 */
function EditEntityForm({
  editing,
  onSubmit,
  onDone,
  setNotice,
}: {
  editing: EditingEntity
  onSubmit: (endpoint: string, body: Record<string, unknown>, message: string, method?: string) => Promise<void>
  onDone: () => void
  setNotice: (notice: Notice) => void
}) {
  const d = editing.data
  const title = editing.type === 'property' ? 'Editar imóvel' : editing.type === 'unit' ? 'Editar unidade' : 'Editar inquilino'
  const endpoint = editing.type === 'property' ? '/api/properties' : editing.type === 'unit' ? '/api/units' : '/api/renters'

  return (
    <div className="setup-form-layout">
      <Panel title={title} subtitle="Atualize os dados e guarde">
        <form
          key={d.id as string}
          onSubmit={async (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()
            const form = event.currentTarget
            try {
              await onSubmit(endpoint, { id: d.id, ...payload(form) }, 'Dados atualizados com sucesso.', 'PATCH')
              onDone()
            } catch (error) {
              setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível guardar as alterações.' })
            }
          }}
        >
          <div className="form-grid">
            {editing.type === 'property' ? (
              <>
                <div className="field"><label htmlFor="edit-name">Nome</label><input id="edit-name" name="name" defaultValue={d.name as string} required /></div>
                <div className="field"><label htmlFor="edit-address1">Endereço</label><input id="edit-address1" name="addressLine1" autoComplete="address-line1" defaultValue={d.addressLine1 as string} required /></div>
                <div className="field"><label htmlFor="edit-city">Cidade</label><input id="edit-city" name="city" autoComplete="address-level2" defaultValue={d.city as string} required /></div>
                <div className="field"><label htmlFor="edit-region">Região</label><input id="edit-region" name="region" autoComplete="address-level1" defaultValue={d.region as string} required /></div>
                <div className="field"><label htmlFor="edit-postal">CEP</label><input id="edit-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" defaultValue={d.postalCode as string} required /></div>
                <div className="field"><label htmlFor="edit-country">País</label><input id="edit-country" name="country" autoComplete="country-name" defaultValue={(d.country as string) ?? 'Brasil'} /></div>
                <div className="field field-full"><label htmlFor="edit-description">Descrição</label><textarea id="edit-description" name="description" defaultValue={(d.description as string) ?? ''} /></div>
              </>
            ) : null}
            {editing.type === 'unit' ? (
              <>
                <div className="field"><label htmlFor="edit-uname">Nome</label><input id="edit-uname" name="name" defaultValue={d.name as string} required /></div>
                <div className="field"><label htmlFor="edit-urent">Aluguel mensal</label><input id="edit-urent" name="monthlyRent" type="number" step="0.01" defaultValue={Number(d.monthlyRent ?? 0)} required /></div>
                <div className="field"><label htmlFor="edit-ustatus">Estado</label><select id="edit-ustatus" name="status" defaultValue={(d.status as string) ?? 'Vacant'}><option value="Vacant">Vaga</option><option value="Occupied">Ocupada</option><option value="Maintenance">Em manutenção</option></select></div>
                <div className="field"><label htmlFor="edit-ubedrooms">Quartos</label><input id="edit-ubedrooms" name="bedrooms" type="number" step="1" defaultValue={Number(d.bedrooms ?? 0)} /></div>
                <div className="field"><label htmlFor="edit-ubathrooms">Casas de banho</label><input id="edit-ubathrooms" name="bathrooms" type="number" step="0.5" defaultValue={Number(d.bathrooms ?? 0)} /></div>
                <div className="field field-full"><label htmlFor="edit-unotes">Notas</label><textarea id="edit-unotes" name="notes" defaultValue={(d.notes as string) ?? ''} /></div>
              </>
            ) : null}
            {editing.type === 'renter' ? (
              <>
                <div className="field field-full"><label htmlFor="edit-rname">Nome completo</label><input id="edit-rname" name="fullName" autoComplete="name" defaultValue={d.fullName as string} required /></div>
                <div className="field"><label htmlFor="edit-remail">Email</label><input id="edit-remail" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={(d.email as string) ?? ''} /></div>
                <div className="field"><label htmlFor="edit-rphone">Telefone</label><input id="edit-rphone" name="phone" type="tel" autoComplete="tel" inputMode="tel" defaultValue={(d.phone as string) ?? ''} /></div>
                <div className="field field-full"><label htmlFor="edit-rdoc">Documento / NIF</label><input id="edit-rdoc" name="governmentId" defaultValue={(d.governmentId as string) ?? ''} /></div>
                <div className="field field-full"><label htmlFor="edit-rnotes">Notas</label><textarea id="edit-rnotes" name="notes" defaultValue={(d.notes as string) ?? ''} /></div>
              </>
            ) : null}
          </div>
          <div className="form-actions">
            <button className="button button-primary" type="submit">Guardar alterações</button>
            <button className="button button-secondary" type="button" onClick={onDone}>Cancelar</button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

type ControlCenterMode = 'all' | 'dashboard' | 'portfolio' | 'leases' | 'billing' | 'operations'

export function ControlCenterPage({ mode = 'all' }: { mode?: ControlCenterMode }) {
  const [state, setState] = useState<State>(initialState)
  const [options, setOptions] = useState<Options>(emptyOptions)
  const [pageInfo, setPageInfo] = useState<Record<string, PageInfo>>({})
  const [loadingMore, setLoadingMore] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('')
  const [ticketPriorityFilter, setTicketPriorityFilter] = useState<string>('')
  const [ticketPropertyId, setTicketPropertyId] = useState<string>('')
  const [setupStep, setSetupStep] = useState<SetupStep | null>(null)
  const [editing, setEditing] = useState<EditingEntity | null>(null)
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'overdue' | 'open'>('all')

  const showPortfolio = mode === 'all' || mode === 'portfolio'
  const showLeases = mode === 'all' || mode === 'leases'
  const showBilling = mode === 'all' || mode === 'billing'
  const showOperations = mode === 'all' || mode === 'operations'

  const fetchJson = useCallback(async (endpoint: string) => {
    const response = await fetch(endpoint)
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiErrorMessage(body, 'Não foi possível carregar os dados.'))
    return body
  }, [])

  const invoicesUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ take: '25' })
    if (invoiceFilter !== 'all') params.set('status', invoiceFilter)
    if (cursor) params.set('cursor', cursor)
    return `/api/invoices?${params.toString()}`
  }, [invoiceFilter])

  const ticketsUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ take: '25' })
    if (ticketStatusFilter) params.set('status', ticketStatusFilter)
    if (ticketPriorityFilter) params.set('priority', ticketPriorityFilter)
    if (cursor) params.set('cursor', cursor)
    return `/api/tickets?${params.toString()}`
  }, [ticketStatusFilter, ticketPriorityFilter])

  /**
   * Carrega apenas o que a página atual precisa, sempre paginado (nunca coleções inteiras).
   * Mudanças de filtro re-executam este load (bounded). As opções de selects vêm à parte,
   * limitadas a 500 registos — o combobox com pesquisa assíncrona é o passo seguinte (P1).
   */
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const nextState: Partial<State> = {}
      const nextPages: Record<string, PageInfo> = {}
      const nextOptions: Partial<Options> = {}

      const paged = async (key: Exclude<keyof State, 'dashboard'>, url: string) => {
        const page = (await fetchJson(url)) as Paged<Row>
        nextState[key] = page.items
        nextPages[key] = { nextCursor: page.nextCursor, total: page.total }
      }
      const optionList = async (key: keyof Options, url: string) => {
        const page = (await fetchJson(url)) as Paged<Row>
        nextOptions[key] = page.items
      }

      const jobs: Promise<void>[] = [
        fetchJson('/api/dashboard').then((dashboard) => { nextState.dashboard = dashboard as Dashboard }),
      ]
      if (showPortfolio) {
        jobs.push(paged('properties', '/api/properties?take=24'))
        jobs.push(paged('renters', '/api/renters?take=24'))
        jobs.push(optionList('properties', '/api/properties?take=500'))
        jobs.push(optionList('units', '/api/units?take=500'))
      }
      if (showLeases) {
        jobs.push(paged('leases', '/api/leases?take=25'))
        jobs.push(optionList('properties', '/api/properties?take=500'))
        jobs.push(optionList('units', '/api/units?take=500'))
        jobs.push(optionList('renters', '/api/renters?take=500'))
      }
      if (showBilling) {
        jobs.push(paged('invoices', invoicesUrl()))
        jobs.push(paged('payments', '/api/payments?take=25'))
        jobs.push(paged('expenses', '/api/expenses?take=12'))
        jobs.push(optionList('awaitingPayments', '/api/payments?status=awaiting&take=50'))
        jobs.push(optionList('properties', '/api/properties?take=500'))
      }
      if (showOperations) {
        jobs.push(paged('maintenance', ticketsUrl()))
        jobs.push(optionList('properties', '/api/properties?take=500'))
      }
      await Promise.all(jobs)

      setState((current) => ({ ...current, ...nextState }))
      setPageInfo((current) => ({ ...current, ...nextPages }))
      setOptions((current) => ({ ...current, ...nextOptions }))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar os dados.' })
    } finally {
      setLoading(false)
    }
  }, [fetchJson, invoicesUrl, ticketsUrl, showPortfolio, showLeases, showBilling, showOperations])

  useEffect(() => {
    void load()
  }, [load])

  /** "Ver mais": busca a página seguinte de uma coleção e acrescenta (DOM cresce só quando pedido). */
  async function loadMore(key: Exclude<keyof State, 'dashboard'>) {
    const info = pageInfo[key]
    if (!info?.nextCursor || loadingMore) return
    setLoadingMore(key)
    try {
      let url = ''
      switch (key) {
        case 'properties': url = `/api/properties?take=24&cursor=${info.nextCursor}`; break
        case 'units': url = `/api/units?take=24&cursor=${info.nextCursor}`; break
        case 'renters': url = `/api/renters?take=24&cursor=${info.nextCursor}`; break
        case 'leases': url = `/api/leases?take=25&cursor=${info.nextCursor}`; break
        case 'invoices': url = invoicesUrl(info.nextCursor); break
        case 'payments': url = `/api/payments?take=25&cursor=${info.nextCursor}`; break
        case 'expenses': url = `/api/expenses?take=12&cursor=${info.nextCursor}`; break
        case 'maintenance': url = ticketsUrl(info.nextCursor); break
      }
      const page = (await fetchJson(url)) as Paged<Row>
      setState((current) => ({ ...current, [key]: [...(current[key] as Row[]), ...page.items] }))
      setPageInfo((current) => ({ ...current, [key]: { nextCursor: page.nextCursor, total: page.total } }))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar mais registos.' })
    } finally {
      setLoadingMore(null)
    }
  }

  function LoadMoreButton({ k }: { k: Exclude<keyof State, 'dashboard'> }) {
    const info = pageInfo[k]
    if (!info?.nextCursor) return null
    const shown = (state[k] as Row[]).length
    return (
      <button className="apt-load-more" type="button" disabled={loadingMore === k} aria-busy={loadingMore === k} onClick={() => void loadMore(k)}>
        {loadingMore === k ? 'A carregar…' : `Ver mais (${shown} de ${info.total})`}
      </button>
    )
  }

  async function postJson(endpoint: string, body: Record<string, unknown>, message: string, method = 'POST') {
    if (submitting) return

    setSubmitting(endpoint)
    try {
      const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
      setNotice({ kind: 'success', text: message })
      await load()
    } catch (error) {
      // Centraliza o erro para que os botões de ação (confirmar/terminar/apagar) também o mostrem.
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível concluir o pedido.' })
      throw error
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
  const activeLeaseCount = counts?.activeLeases ?? 0
  const propertyOptions = useMemo(
    () => options.properties.map((property) => ({ id: property.id as string, label: (property.addressLine1 as string) || (property.name as string) })),
    [options.properties]
  )
  const unitOptions = useMemo(
    () => options.units.map((unit) => ({ id: unit.id as string, propertyId: unit.propertyId as string, label: `${unit.name as string} · ${(unit.property?.addressLine1 as string) ?? (unit.property?.name as string) ?? 'Imóvel'}` })),
    [options.units]
  )
  const renterOptions = useMemo(() => options.renters.map((renter) => ({ id: renter.id as string, label: renter.fullName as string })), [options.renters])

  // Filtros aplicados no servidor: as listas chegam prontas.
  const filteredTickets = state.maintenance
  const visibleInvoices = state.invoices
  const awaitingPayments = options.awaitingPayments
  const currentPeriod = new Date().toISOString().slice(0, 7)

  const SectionHeading = mode === 'all' ? 'h2' : 'h1'
  const overdueTotal = finances?.overdueTotal ?? 0
  const setupComplete = !!counts && counts.properties > 0 && counts.units > 0 && counts.renters > 0
  // Durante o onboarding, guia automaticamente até ao próximo passo em falta.
  // Com o portfólio já configurado, só abre um formulário quando o utilizador escolhe adicionar algo.
  const currentSetupStep: SetupStep | null = setupComplete
    ? setupStep
    : (setupStep ?? (!(counts?.properties ?? 0) ? 'property' : !(counts?.units ?? 0) ? 'unit' : !(counts?.renters ?? 0) ? 'renter' : null))

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
      {showPortfolio ? <section className="section" id="cadastros">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">{setupComplete ? 'Os seus imóveis' : 'Configuração do portfólio'}</SectionHeading>
            <p>{setupComplete ? 'A sua carteira de imóveis, unidades e ocupação num só lugar.' : 'Complete estes passos pela ordem indicada. Mostramos apenas o que precisa em cada momento.'}</p>
          </div>
          {setupComplete && !currentSetupStep && !editing
            ? <button className="button button-primary" type="button" onClick={() => { setEditing(null); setSetupStep('property') }}>Adicionar imóvel</button>
            : loading ? <span className="pill pill-soft">A atualizar...</span> : <span className="pill pill-positive">Tudo atualizado</span>}
        </div>

        {!setupComplete ? (
        <div className="setup-progress" aria-label="Passos de configuração">
          <SetupStepCard number={1} title="Registar imóvel" description="Morada e dados principais." status={propertyOptions.length ? 'completed' : currentSetupStep === 'property' ? 'active' : 'available'} onSelect={() => setSetupStep('property')} />
          <SetupStepCard number={2} title="Criar unidade" description={propertyOptions.length ? 'Defina renda e ocupação.' : 'Disponível depois do primeiro imóvel.'} status={!propertyOptions.length ? 'locked' : unitOptions.length ? 'completed' : currentSetupStep === 'unit' ? 'active' : 'available'} onSelect={() => setSetupStep('unit')} />
          <SetupStepCard number={3} title="Adicionar inquilino" description={unitOptions.length ? 'Registe os dados de contacto.' : 'Disponível depois da primeira unidade.'} status={!unitOptions.length ? 'locked' : renterOptions.length ? 'completed' : currentSetupStep === 'renter' ? 'active' : 'available'} onSelect={() => setSetupStep('renter')} />
          <SetupStepCard number={4} title="Criar contrato" description={renterOptions.length ? 'Associe imóvel, unidade e inquilino.' : 'Disponível depois do primeiro inquilino.'} status={!renterOptions.length ? 'locked' : (counts?.leases ?? 0) > 0 ? 'completed' : 'available'} href="/leases" />
        </div>
        ) : null}

        {setupComplete && !currentSetupStep && editing ? (
          <EditEntityForm editing={editing} onSubmit={postJson} onDone={() => setEditing(null)} setNotice={setNotice} />
        ) : null}

        {setupComplete && !currentSetupStep && !editing ? (
        <>
          <div className="prop-summary">
            <div className="prop-sum-tile" aria-label={`${counts?.properties ?? 0} imóveis`}><UiIcon name="building" /><strong>{counts?.properties ?? 0}</strong><span>imóveis</span></div>
            <div className="prop-sum-tile prop-sum-occ" aria-label={`${counts?.occupiedUnits ?? 0} ocupadas`}><UiIcon name="check" /><strong>{counts?.occupiedUnits ?? 0}</strong><span>ocupadas</span></div>
            <div className="prop-sum-tile prop-sum-free" aria-label={`${counts?.vacantUnits ?? 0} livres`}><UiIcon name="key" /><strong>{counts?.vacantUnits ?? 0}</strong><span>livres</span></div>
            <div className="prop-sum-tile prop-sum-rent" aria-label="aluguel mensal ocupado"><UiIcon name="euro" /><strong>{money(finances?.occupiedRent ?? 0)}</strong><span>por mês</span></div>
          </div>
          <div className="prop-grid">
            {state.properties.map((property) => <PropertyCard key={property.id as string} property={property} onEditProperty={(p) => setEditing({ type: 'property', data: p })} />)}
          </div>
          <LoadMoreButton k="properties" />
          {state.renters.length ? (
            <article className="card">
              <div className="card-header"><h2>Inquilinos</h2><span>{pageInfo.renters?.total ?? state.renters.length} {(pageInfo.renters?.total ?? state.renters.length) === 1 ? 'registado' : 'registados'}</span></div>
              <div className="card-body"><div className="stack">
                {state.renters.map((renter) => (
                  <div key={renter.id as string} className="unit-row">
                    <div>
                      <strong>{renter.fullName as string}</strong>
                      <span className="muted">{(renter.email as string) || 'Sem email'} · {(renter.phone as string) || 'Sem telefone'}</span>
                    </div>
                    <button className="small-button" type="button" onClick={() => setEditing({ type: 'renter', data: renter })}>Editar</button>
                  </div>
                ))}
              </div>
              <LoadMoreButton k="renters" />
              </div>
            </article>
          ) : null}
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
                <div className="field"><label htmlFor="property-postal">CEP</label><input id="property-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" required /></div>
                <div className="field"><label htmlFor="property-country">País</label><input id="property-country" name="country" autoComplete="country-name" defaultValue="Brasil" /></div>
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
                <div className="field"><label htmlFor="unit-rent">Aluguel mensal</label><input id="unit-rent" name="monthlyRent" type="number" step="0.01" required /></div>
                <div className="field"><label htmlFor="unit-status">Estado</label><select id="unit-status" name="status" defaultValue="Vacant"><option value="Vacant">Vaga</option><option value="Occupied">Ocupada</option><option value="Maintenance">Em manutenção</option></select></div>
                <div className="field"><label htmlFor="unit-bedrooms">Quartos</label><input id="unit-bedrooms" name="bedrooms" type="number" step="1" /></div>
                <div className="field"><label htmlFor="unit-bathrooms">Casas de banho</label><input id="unit-bathrooms" name="bathrooms" type="number" step="0.5" /></div>
                <div className="field field-full"><label htmlFor="unit-notes">Notas</label><textarea id="unit-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={propertyOptions.length === 0 || submitting === '/api/units'}>{submitting === '/api/units' ? 'A criar...' : 'Criar unidade'}</button></div>
            </form>
            <RecordList items={options.units} empty={{ title: 'Ainda não existem unidades registadas.', hint: 'Depois de criar o imóvel, registe cada unidade para permitir contratos e cobrança mensal.', actionLabel: 'Registar unidade', actionHref: '#unit-property' }} render={(unit) => (
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
            <SectionHeading className="section-title">Contratos</SectionHeading>
            <p>Os contratos de arrendamento dos seus apartamentos.</p>
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

          <div className="fin-block fin-block-flush">
            <h2>Contratos ativos</h2>
            {state.leases.length ? (
              <ul className="fin-list">
                {state.leases.map((lease) => {
                  const name = (lease.renter?.fullName as string) || '—'
                  const active = lease.status === 'Active'
                  return (
                    <li key={lease.id as string} className="fin-item">
                      <span className="apt-avatar fin-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>
                      <span className="fin-item-body">
                        <strong>{name}</strong>
                        <span className="fin-item-sub">{(lease.property?.name as string) ?? '—'} · {money(Number(lease.monthlyRent ?? 0))}/mês</span>
                      </span>
                      <span className="fin-item-right">
                        <span className={`fin-status ${active ? 'fin-status-paid' : 'fin-status-muted'}`}>{active ? 'Ativo' : 'Terminado'}</span>
                      </span>
                      {active ? (
                        <button
                          className="apt-mini-delete"
                          type="button"
                          disabled={submitting === '/api/leases'}
                          onClick={() => { if (window.confirm('Terminar este contrato? O apartamento fica livre para um novo arrendamento.')) void postJson('/api/leases', { leaseId: lease.id, status: 'Ended' }, 'Contrato terminado. O apartamento ficou livre.', 'PATCH') }}
                        >
                          {submitting === '/api/leases' ? 'A terminar…' : 'Terminar'}
                        </button>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : <p className="muted">Ainda não há contratos. Use o assistente ao lado para criar o primeiro.</p>}
            <LoadMoreButton k="leases" />
          </div>
        </div>
      </section> : null}
      {showBilling ? <section className="section" id="financeiro">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">Finanças</SectionHeading>
            <p>O dinheiro do mês, as cobranças e as despesas — num só sítio.</p>
          </div>
        </div>

        <div className="fin-summary">
          <div className="fin-card">
            <span className="fin-ic fin-ic-green"><UiIcon name="wallet" /></span>
            <span className="fin-card-text"><small>Recebido</small><strong>{finances ? money(finances.monthlyConfirmedPayments) : money(0)}</strong></span>
          </div>
          <div className="fin-card">
            <span className="fin-ic fin-ic-amber"><UiIcon name="clock" /></span>
            <span className="fin-card-text"><small>Por receber</small><strong>{finances ? money(finances.openInvoices) : money(0)}</strong></span>
          </div>
          <div className="fin-card">
            <span className="fin-ic fin-ic-red"><UiIcon name="alert" /></span>
            <span className="fin-card-text"><small>Em atraso</small><strong>{money(overdueTotal)}</strong></span>
          </div>
          <div className="fin-card">
            <span className="fin-ic"><UiIcon name="euro" /></span>
            <span className="fin-card-text"><small>Despesas</small><strong>{finances ? money(finances.monthlyExpenses) : money(0)}</strong></span>
          </div>
        </div>

        {activeLeaseCount > 0 ? (
          <form
            className="fin-generate"
            onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); try { await postJson('/api/invoices/generate', { period: currentPeriod }, 'Cobranças do mês criadas.') } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar as cobranças.' }) } }}
          >
            <button className="apt-add" type="submit" disabled={submitting === '/api/invoices/generate'}>
              <UiIcon name="plus" />{submitting === '/api/invoices/generate' ? 'A gerar…' : `Gerar cobranças de ${periodLabel(currentPeriod)}`}
            </button>
          </form>
        ) : null}

        <div className="fin-block">
          <div className="fin-block-head">
            <h2>Cobranças</h2>
            <div className="fin-filter" role="group" aria-label="Filtrar cobranças">
              {([['all', 'Todas'], ['overdue', 'Em atraso'], ['open', 'Por receber']] as const).map(([value, label]) => (
                <button key={value} type="button" className={`fin-filter-item ${invoiceFilter === value ? 'fin-filter-item-active' : ''}`} aria-pressed={invoiceFilter === value} onClick={() => setInvoiceFilter(value)}>{label}</button>
              ))}
            </div>
          </div>
          {visibleInvoices.length ? (
            <ul className="fin-list">
              {visibleInvoices.map((invoice) => {
                const st = invoiceStatusInfo(invoice.status as string)
                const name = (invoice.lease?.renter?.fullName as string) || '—'
                const phone = invoice.lease?.renter?.phone as string | undefined
                return (
                  <li key={invoice.id as string} className="fin-item">
                    <span className="apt-avatar fin-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>
                    <span className="fin-item-body">
                      <strong>{name}</strong>
                      <span className="fin-item-sub">{periodLabel(invoice.period as string)} · vence {date(invoice.dueDate)}</span>
                    </span>
                    <span className="fin-item-right">
                      <strong className="fin-amount">{money(Number(invoice.amount ?? 0))}</strong>
                      <span className={`fin-status fin-status-${st.tone}`}>{st.word}</span>
                    </span>
                    {phone && st.tone !== 'paid' ? (
                      <button className="fin-remind" type="button" aria-label={`Enviar lembrete a ${name} por WhatsApp`} disabled={sendingInvoiceId === invoice.id} onClick={() => { if (window.confirm('Enviar lembrete por WhatsApp?')) void sendInvoiceViaWhatsApp(invoice) }}>
                        <UiIcon name="phone" />
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : <p className="muted">{state.invoices.length ? 'Nenhuma cobrança com este filtro.' : 'Ainda não há cobranças. Gere as cobranças do mês no botão acima.'}</p>}
          <LoadMoreButton k="invoices" />
        </div>

        {awaitingPayments.length ? (
          <div className="fin-block">
            <h2>Pagamentos por confirmar</h2>
            <ul className="fin-list">
              {awaitingPayments.map((payment) => {
                const name = (payment.invoice?.lease?.renter?.fullName as string) || '—'
                return (
                  <li key={payment.id as string} className="fin-item">
                    <span className="apt-avatar fin-avatar" style={{ background: avatarColor(name) }}>{initials(name)}</span>
                    <span className="fin-item-body">
                      <strong>{name}</strong>
                      <span className="fin-item-sub">{dateTime(payment.paidAt)} · {money(Number(payment.amount ?? 0))}</span>
                    </span>
                    <button className="fin-confirm" type="button" disabled={submitting === `/api/payments/${payment.id as string}/confirm`} onClick={() => void postJson(`/api/payments/${payment.id as string}/confirm`, {}, 'Pagamento confirmado.')}>
                      {submitting === `/api/payments/${payment.id as string}/confirm` ? 'A confirmar…' : 'Confirmar'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        <div className="fin-block">
          <h2>Despesas</h2>
          {state.expenses.length ? (
            <ul className="fin-list">
              {state.expenses.map((expense) => (
                <li key={expense.id as string} className="fin-item">
                  <span className="fin-ic fin-ic-plain"><UiIcon name="euro" /></span>
                  <span className="fin-item-body">
                    <strong>{expense.category as string}</strong>
                    <span className="fin-item-sub">{(expense.property?.name as string) ?? (expense.lease?.property?.name as string) ?? '—'} · {date(expense.incurredAt)}</span>
                  </span>
                  <span className="fin-item-right"><strong className="fin-amount">{money(Number(expense.amount ?? 0))}</strong></span>
                  <button className="apt-mini-delete" type="button" disabled={submitting === `/api/expenses/${expense.id as string}`} onClick={() => { if (window.confirm('Apagar esta despesa?')) void postJson(`/api/expenses/${expense.id as string}`, {}, 'Despesa apagada.', 'DELETE') }}>Apagar</button>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Ainda não há despesas registadas.</p>}
          <LoadMoreButton k="expenses" />

          {propertyOptions.length ? (
            <form className="apt-bill-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/expenses', payload(form), 'Despesa registada.'); form.reset() } catch { /* erro já mostrado */ } }}>
              <div className="apt-bill-grid">
                <div className="field"><label htmlFor="fin-exp-cat">Tipo</label><select id="fin-exp-cat" name="category" defaultValue="Condomínio">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="field"><label htmlFor="fin-exp-amount">Valor (R$)</label><input id="fin-exp-amount" name="amount" type="number" step="0.01" min="0.01" required /></div>
                <div className="field"><label htmlFor="fin-exp-prop">Imóvel</label><select id="fin-exp-prop" name="propertyId" required defaultValue=""><option value="" disabled>Selecionar imóvel</option>{propertyOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
                <div className="field"><label htmlFor="fin-exp-date">Data</label><input id="fin-exp-date" name="incurredAt" type="date" defaultValue={todayISO()} /></div>
                <div className="field field-full"><label htmlFor="fin-exp-desc">Descrição (opcional)</label><input id="fin-exp-desc" name="description" placeholder="Ex.: Reparação de canalização" /></div>
              </div>
              <button className="button button-primary" type="submit" disabled={submitting === '/api/expenses'}>{submitting === '/api/expenses' ? 'A registar…' : 'Adicionar despesa'}</button>
            </form>
          ) : null}
        </div>
      </section> : null}

      {showOperations ? <section className="section" id="operacao">
        <div className="section-header">
          <div>
            <SectionHeading className="section-title">Manutenção</SectionHeading>
            <p>Crie e acompanhe pedidos de reparação dos seus apartamentos.</p>
          </div>
          <span className="pill pill-soft">Pedidos: {pageInfo.maintenance?.total ?? filteredTickets.length}</span>
        </div>
        <div className="grid-2">
          <Panel title="Novo pedido de manutenção" subtitle="Descreva o problema">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/tickets', payload(form), 'Pedido criado. Pode acompanhar o estado nesta área de manutenção.') ; form.reset(); setTicketPropertyId('') } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o pedido.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="ticket-title">Qual é o problema?</label><input id="ticket-title" name="title" required placeholder="Ex.: Infiltração na cozinha" /></div>
                <div className="field field-full"><label htmlFor="ticket-description">Conte-nos mais</label><textarea id="ticket-description" name="description" placeholder="Descreva o que aconteceu e quando começou." /></div>
                <div className="field field-full"><label htmlFor="ticket-property">Qual apartamento?</label><select id="ticket-property" name="propertyId" value={ticketPropertyId} onChange={(event) => setTicketPropertyId(event.target.value)}><option value="">Selecionar apartamento</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field field-full"><label>Qual é a urgência?</label>
                  <div className="segmented" role="radiogroup" aria-label="Urgência">
                    {([['Low', 'Baixa'], ['Normal', 'Normal'], ['High', 'Alta'], ['Urgent', 'Urgente']] as const).map(([value, label]) => (
                      <label key={value}><input type="radio" name="priority" value={value} defaultChecked={value === 'Normal'} /><span>{label}</span></label>
                    ))}
                  </div>
                </div>
                <input type="hidden" name="status" value="New" />
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/tickets'}>{submitting === '/api/tickets' ? 'A criar...' : 'Criar pedido'}</button></div>
            </form>
          </Panel>

          <Panel title="Pedidos de manutenção" subtitle="Acompanhamento diário">
            {(pageInfo.maintenance?.total ?? 0) > 0 || ticketStatusFilter || ticketPriorityFilter ? <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field"><label htmlFor="ticket-filter-status">Estado</label><select id="ticket-filter-status" value={ticketStatusFilter} onChange={(event) => setTicketStatusFilter(event.target.value)}><option value="">Todos</option><option value="New">Novo</option><option value="Triaged">Em análise</option><option value="Waiting">A aguardar</option><option value="Resolved">Resolvido</option><option value="Closed">Fechado</option></select></div>
              <div className="field"><label htmlFor="ticket-filter-priority">Urgência</label><select id="ticket-filter-priority" value={ticketPriorityFilter} onChange={(event) => setTicketPriorityFilter(event.target.value)}><option value="">Todas</option><option value="Low">Baixa</option><option value="Normal">Normal</option><option value="High">Alta</option><option value="Urgent">Urgente</option></select></div>
            </div> : null}
            {filteredTickets.length ? (
              <ul className="fin-list">
                {filteredTickets.map((ticket) => {
                  const tone = ticket.status === 'Resolved' ? 'paid' : ticket.status === 'Closed' ? 'muted' : 'due'
                  return (
                    <li key={ticket.id as string} className="fin-ticket">
                      <div className="fin-ticket-top">
                        <span className="fin-ic fin-ic-plain"><UiIcon name="tools" /></span>
                        <div className="fin-item-body">
                          <strong>{ticket.title as string}</strong>
                          <span className="fin-item-sub">{(ticket.property?.name as string) ?? 'Sem apartamento'}{ticket.renter?.fullName ? ` · ${ticket.renter.fullName as string}` : ''}{ticket.priority && ticket.priority !== 'Normal' ? ` · ${statusLabel(ticket.priority as string)}` : ''}</span>
                        </div>
                        <span className={`fin-status fin-status-${tone}`}>{statusLabel(ticket.status as string)}</span>
                      </div>
                      <div className="fin-ticket-actions">
                        {ticket.status === 'New' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Triaged', note: 'Pedido analisado no painel.' }, 'Pedido marcado como em análise.', 'PATCH')}>Começar análise</button> : null}
                        {ticket.status !== 'Waiting' && ticket.status !== 'Closed' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Waiting', note: 'A aguardar fornecedor, peça ou resposta.' }, 'Pedido marcado como a aguardar.', 'PATCH')}>A aguardar</button> : null}
                        {ticket.status !== 'Resolved' && ticket.status !== 'Closed' ? <button className="small-button" type="button" onClick={() => void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Resolved', note: 'Problema resolvido.' }, 'Pedido resolvido.', 'PATCH')}>Marcar resolvido</button> : null}
                        {ticket.status === 'Resolved' ? <button className="small-button" type="button" onClick={() => { if (window.confirm('Fechar este pedido? Continuará no histórico.')) void postJson(`/api/tickets/${ticket.id as string}`, { status: 'Closed', note: 'Encerramento confirmado.' }, 'Pedido fechado.', 'PATCH') }}>Fechar</button> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : <p className="muted">{state.maintenance.length ? 'Não há pedidos com estes filtros.' : 'Ainda não há pedidos de manutenção.'}</p>}
            <LoadMoreButton k="maintenance" />
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
