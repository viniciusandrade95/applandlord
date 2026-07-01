'use client'

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  expenses: Row[]
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
  expenses: [],
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
function PropertyCard({ property, onEditProperty, onEditUnit }: { property: Row; onEditProperty: (property: Row) => void; onEditUnit: (unit: Row) => void }) {
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
        <button className="small-button" type="button" onClick={() => onEditProperty(property)}>Editar</button>
      </div>
      <div className="card-body">
        <p className="muted" style={{ margin: '0 0 12px' }}>{property.addressLine1 as string}{property.city ? `, ${property.city as string}` : ''}</p>
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
                  <div className="unit-row-actions">
                    <span className={chipClass(unit.status as string)}>{statusLabel(unit.status as string)}</span>
                    <button className="small-button" type="button" onClick={() => onEditUnit(unit)}>Editar</button>
                  </div>
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
                <div className="field"><label htmlFor="edit-postal">Código postal</label><input id="edit-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" defaultValue={d.postalCode as string} required /></div>
                <div className="field"><label htmlFor="edit-country">País</label><input id="edit-country" name="country" autoComplete="country-name" defaultValue={(d.country as string) ?? 'Portugal'} /></div>
                <div className="field field-full"><label htmlFor="edit-description">Descrição</label><textarea id="edit-description" name="description" defaultValue={(d.description as string) ?? ''} /></div>
              </>
            ) : null}
            {editing.type === 'unit' ? (
              <>
                <div className="field"><label htmlFor="edit-uname">Nome</label><input id="edit-uname" name="name" defaultValue={d.name as string} required /></div>
                <div className="field"><label htmlFor="edit-urent">Renda mensal</label><input id="edit-urent" name="monthlyRent" type="number" step="0.01" defaultValue={Number(d.monthlyRent ?? 0)} required /></div>
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

type Apartment = {
  unit: Row
  property: Row | null
  lease: Row | null
  renter: Row | null
  currentInvoice: Row | null
  monthStatus: 'paid' | 'confirming' | 'due' | 'vacant'
  rent: number
}

function apartmentBadgeLabel(status: Apartment['monthStatus']) {
  switch (status) {
    case 'paid':
      return 'Pago este mês'
    case 'confirming':
      return 'Pagamento por confirmar'
    case 'due':
      return 'Falta pagar'
    default:
      return 'Vago · sem inquilino'
  }
}

/**
 * Cartão grande e legível de um apartamento na página inicial.
 * Mostra o essencial que a senhora precisa: morada, inquilino, renda e se já pagou este mês.
 * O cartão inteiro abre o detalhe; o botão "Marcar como pago" é uma ação separada (não aninhada).
 */
function ApartmentCard({ apt, onOpen, onMarkPaid, paying }: {
  apt: Apartment
  onOpen: (unitId: string) => void
  onMarkPaid: (apt: Apartment) => void
  paying: boolean
}) {
  const { unit, property, renter, monthStatus, rent } = apt
  const title = (property?.name as string) || (unit.name as string)
  const address = property ? `${property.addressLine1 as string}${property.city ? `, ${property.city as string}` : ''}` : ''
  return (
    <div className={`apt-card apt-card-${monthStatus}`}>
      <button className="apt-card-main" type="button" data-apt-card={unit.id as string} aria-label={`Abrir ${title}`} onClick={() => onOpen(unit.id as string)}>
        <span className="apt-card-avatar"><UiIcon name="building" /></span>
        <span className="apt-card-info">
          <strong className="apt-card-title">{title}</strong>
          {address ? <span className="apt-card-sub">{address}</span> : null}
          <span className="apt-card-tenant">{renter ? `${renter.fullName as string} · ${money(rent)}/mês` : 'Sem inquilino'}</span>
          <span className={`apt-badge apt-badge-${monthStatus}`}>{apartmentBadgeLabel(monthStatus)}</span>
        </span>
        <span className="apt-card-arrow"><UiIcon name="arrow" /></span>
      </button>
      {monthStatus === 'due' || monthStatus === 'confirming' ? (
        <button className="apt-pay" type="button" disabled={paying} aria-busy={paying} onClick={() => onMarkPaid(apt)}>
          {paying ? 'Um momento…' : monthStatus === 'confirming' ? 'Confirmar pagamento' : 'Marcar como pago'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * Detalhe de um apartamento: tudo o que interessa sobre ele num só ecrã, sem separadores.
 * Inquilino + contacto, renda, datas do contrato, estado do mês, histórico de pagamentos
 * e atalhos para as ações menos frequentes (editar dados, registar avaria).
 */
function ApartmentDetail({ apt, payments, onMarkPaid, paying }: {
  apt: Apartment
  payments: Row[]
  onMarkPaid: (apt: Apartment) => void
  paying: boolean
}) {
  const { unit, property, lease, renter, monthStatus, rent } = apt
  const address = property ? `${property.addressLine1 as string}${property.city ? `, ${property.city as string}` : ''}` : ''
  const phone = renter?.phone ? String(renter.phone) : ''
  const leasePayments = lease
    ? payments.filter((payment) => (payment.invoice?.lease?.id as string) === (lease.id as string))
    : []
  const monthTitle = monthStatus === 'paid'
    ? 'Renda recebida'
    : monthStatus === 'confirming'
      ? 'Pagamento por confirmar'
      : monthStatus === 'due'
        ? 'Renda por receber'
        : 'Apartamento vago'
  return (
    <section className="apt-detail">
      <p className="apt-detail-address">{address}{unit.name ? ` · ${unit.name as string}` : ''}</p>

      <div className={`apt-detail-month apt-detail-month-${monthStatus}`}>
        <div>
          <span>Este mês</span>
          <strong>{monthTitle}</strong>
        </div>
        {monthStatus === 'due' || monthStatus === 'confirming' ? (
          <button className="apt-pay" type="button" disabled={paying} aria-busy={paying} onClick={() => onMarkPaid(apt)}>
            {paying ? 'Um momento…' : monthStatus === 'confirming' ? 'Confirmar pagamento' : 'Marcar como pago'}
          </button>
        ) : monthStatus === 'paid' ? <span className="apt-badge apt-badge-paid">✓ Pago</span> : null}
      </div>

      {lease ? (
        <div className="apt-detail-card">
          <h2>Inquilino</h2>
          <dl className="apt-facts">
            <div><dt>Nome</dt><dd>{(renter?.fullName as string) ?? '—'}</dd></div>
            <div><dt>Telefone</dt><dd>{phone ? <a href={`tel:${phone}`}>{phone}</a> : '—'}</dd></div>
            <div><dt>Renda</dt><dd>{money(rent)} por mês</dd></div>
            <div><dt>Contrato desde</dt><dd>{date(lease.startDate)}</dd></div>
            {lease.endDate ? <div><dt>Termina</dt><dd>{date(lease.endDate)}</dd></div> : null}
          </dl>
          {phone ? <a className="apt-detail-call" href={`tel:${phone}`}>Ligar ao inquilino</a> : null}
        </div>
      ) : (
        <div className="apt-detail-card apt-detail-vacant">
          <p>Este apartamento está <strong>vago</strong>. Quando encontrar um inquilino, crie o contrato para começar a receber a renda.</p>
          <a className="apt-detail-call" href="/leases">Criar contrato</a>
        </div>
      )}

      {lease ? (
        <div className="apt-detail-card">
          <h2>Últimos pagamentos</h2>
          {leasePayments.length ? (
            <ul className="apt-history">
              {leasePayments.slice(0, 6).map((payment) => (
                <li key={payment.id as string}>
                  <span className="apt-history-date">{date(payment.paidAt)}</span>
                  <strong>{money(Number(payment.amount ?? 0))}</strong>
                  <span className={payment.confirmationStatus === 'Confirmed' ? 'apt-badge apt-badge-paid' : 'apt-badge apt-badge-confirming'}>
                    {payment.confirmationStatus === 'Confirmed' ? 'Confirmado' : 'A confirmar'}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted">Ainda não há pagamentos registados neste apartamento.</p>}
        </div>
      ) : null}

      <div className="apt-detail-links">
        <a href="/portfolio">Editar dados</a>
        <a href="/operations">Registar uma avaria</a>
      </div>
    </section>
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
  const [editing, setEditing] = useState<EditingEntity | null>(null)
  const [invoiceFilter, setInvoiceFilter] = useState<'all' | 'overdue' | 'open'>('all')
  const [openApartmentId, setOpenApartmentId] = useState<string | null>(null)
  const [payingUnitId, setPayingUnitId] = useState<string | null>(null)
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prevOpenRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const endpoints = ['/api/dashboard', '/api/properties', '/api/units', '/api/renters', '/api/leases', '/api/invoices', '/api/payments', '/api/tickets', '/api/expenses']
      const responses = await Promise.all(endpoints.map((endpoint) => fetch(endpoint)))
      const data = await Promise.all(
        responses.map(async (response) => {
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(apiErrorMessage(body, 'Não foi possível carregar os dados do painel.'))
          return body
        })
      )

      setState({ dashboard: data[0], properties: data[1], units: data[2], renters: data[3], leases: data[4], invoices: data[5], payments: data[6], maintenance: data[7], expenses: data[8] })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar painel do senhorio.' })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Gestão de foco ao navegar entre a lista e o detalhe de um apartamento, para quem usa
  // teclado ou leitor de ecrã não perder o sítio: ao abrir vai para o título; ao voltar
  // regressa ao cartão de onde saiu.
  useEffect(() => {
    const previous = prevOpenRef.current
    if (openApartmentId && openApartmentId !== previous) {
      headingRef.current?.focus()
    } else if (!openApartmentId && previous) {
      const card = document.querySelector<HTMLButtonElement>(`[data-apt-card="${previous}"]`)
      card?.focus()
    }
    prevOpenRef.current = openApartmentId
  }, [openApartmentId])

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

  async function apiSend(endpoint: string, body: Record<string, unknown>, method = 'POST') {
    const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
    return data
  }

  async function apiGet(endpoint: string) {
    const response = await fetch(endpoint)
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível carregar os dados.'))
    return data
  }

  // Um só toque para a senhora: garante a cobrança do mês, regista o pagamento em falta e confirma-o.
  // Passa pelo fluxo de pagamento (em vez de mudar o estado da fatura diretamente) para que
  // o valor entre no resumo financeiro "Recebido este mês".
  async function markApartmentPaid(apt: Apartment) {
    if (!apt.lease || payingUnitId) return
    const unitId = apt.unit.id as string
    const leaseId = apt.lease.id as string
    setPayingUnitId(unitId)
    try {
      let invoice = apt.currentInvoice
      if (invoice && invoice.status === 'Paid') {
        setNotice({ kind: 'success', text: 'Esta renda já estava marcada como paga.' })
        return
      }
      if (!invoice) {
        invoice = await apiSend('/api/invoices', { leaseId, period: currentPeriod })
      }
      const invoiceId = invoice?.id as string
      const invoiceAmount = Number(invoice?.amount ?? apt.rent ?? 0)

      // Vamos buscar os pagamentos frescos (o state pode estar desatualizado após uma tentativa
      // falhada), para não criar um segundo pagamento e para pagar apenas o que falta.
      const freshPayments = await apiGet('/api/payments')
      const forInvoice: Row[] = (Array.isArray(freshPayments) ? (freshPayments as Row[]) : []).filter(
        (payment) => (payment.invoice?.id as string) === invoiceId
      )
      const pending = forInvoice.find((payment) => payment.confirmationStatus !== 'Confirmed')
      const confirmedSum = forInvoice
        .filter((payment) => payment.confirmationStatus === 'Confirmed')
        .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)

      let paymentId = pending?.id as string | undefined
      if (!paymentId) {
        const remaining = invoiceAmount - confirmedSum
        const amountToPay = remaining > 0 ? remaining : invoiceAmount
        paymentId = (await apiSend('/api/payments', { invoiceId, amount: amountToPay }))?.id as string
      }
      await apiSend(`/api/payments/${paymentId}/confirm`, {})
      setNotice({ kind: 'success', text: `Renda de ${(apt.renter?.fullName as string) ?? 'inquilino'} marcada como paga.` })
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar como pago.' })
    } finally {
      setPayingUnitId(null)
    }
  }

  const dashboard = state.dashboard
  const counts = dashboard?.counts
  const finances = dashboard?.finances
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

  // Um "apartamento" = uma unidade + o seu contrato ativo (se existir). É o objeto que a
  // senhora reconhece. Ordenamos com "falta pagar" primeiro, para o que precisa de ação ficar em cima.
  const apartments = useMemo<Apartment[]>(() => {
    const order: Record<Apartment['monthStatus'], number> = { due: 0, confirming: 1, paid: 2, vacant: 3 }
    return state.units
      .map((unit) => {
        const property = (unit.property as Row) ?? state.properties.find((item) => item.id === unit.propertyId) ?? null
        const lease = state.leases.find((item) => ((item.unit?.id ?? item.unitId) as string) === (unit.id as string) && item.status === 'Active') ?? null
        const renter = (lease?.renter as Row) ?? null
        // Usamos a lista completa de faturas (state.invoices), não lease.invoices (limitada a 12),
        // para não perder a fatura do mês e evitar criar uma duplicada ao marcar como pago.
        const currentInvoice = lease
          ? state.invoices.find((invoice) =>
              ((invoice.lease?.id ?? invoice.leaseId) as string) === (lease.id as string) &&
              invoice.period === currentPeriod &&
              invoice.status !== 'Canceled' && invoice.status !== 'Cancelled'
            ) ?? null
          : null
        const monthStatus: Apartment['monthStatus'] = !lease
          ? 'vacant'
          : currentInvoice?.status === 'Paid'
            ? 'paid'
            : currentInvoice?.status === 'AwaitingConfirmation'
              ? 'confirming'
              : 'due'
        const rent = lease ? Number(lease.monthlyRent ?? 0) : Number(unit.monthlyRent ?? 0)
        return { unit, property, lease, renter, currentInvoice, monthStatus, rent }
      })
      .sort((a, b) => order[a.monthStatus] - order[b.monthStatus])
  }, [state.units, state.leases, state.properties, state.invoices, currentPeriod])

  const openApartment = openApartmentId ? apartments.find((apt) => (apt.unit.id as string) === openApartmentId) ?? null : null
  const occupiedApartments = apartments.filter((apt) => apt.lease)
  const paidThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'paid').length
  const dueThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'due').length
  const confirmingThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'confirming').length
  const expectedThisMonth = occupiedApartments.reduce((sum, apt) => sum + apt.rent, 0)

  const showDashboard = mode === 'all' || mode === 'dashboard'
  const showPortfolio = mode === 'all' || mode === 'portfolio'
  const showLeases = mode === 'all' || mode === 'leases'
  const showBilling = mode === 'all' || mode === 'billing'
  const showOperations = mode === 'all' || mode === 'operations'
  // Em páginas de modo único o título da secção é o h1 da página; no painel combinado fica h2 sob o h1 do dashboard.
  const SectionHeading = mode === 'all' || mode === 'dashboard' ? 'h2' : 'h1'
  const overdueInvoices = state.invoices.filter((invoice) => invoice.status === 'Overdue')
  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0)
  const visibleInvoices = state.invoices.filter((invoice) =>
    invoiceFilter === 'all'
      ? true
      : invoiceFilter === 'overdue'
        ? invoice.status === 'Overdue'
        : invoice.status !== 'Paid' && invoice.status !== 'Canceled' && invoice.status !== 'Cancelled'
  )
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
            {openApartment
              ? <button className="apt-back" type="button" onClick={() => setOpenApartmentId(null)}>‹ Os meus apartamentos</button>
              : <p className="screen-kicker">A sua gestão, simples e clara</p>}
            <h1 ref={headingRef} tabIndex={-1}>{openApartment ? ((openApartment.property?.name as string) || (openApartment.unit.name as string)) : 'Os meus apartamentos'}</h1>
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

        {loading && apartments.length === 0 ? (
          <p className="muted" style={{ padding: '8px 2px' }}>A carregar os seus apartamentos…</p>
        ) : apartments.length === 0 ? (
          <EmptyDashboardState />
        ) : openApartment ? (
          <ApartmentDetail
            apt={openApartment}
            payments={state.payments}
            onMarkPaid={markApartmentPaid}
            paying={payingUnitId === (openApartment.unit.id as string)}
          />
        ) : (
          <>
            <section className="apt-month" aria-label="Resumo deste mês">
              <p className="apt-month-title">Este mês</p>
              <div className="apt-month-stats">
                <div className="apt-month-stat apt-month-stat-paid">
                  <strong>{paidThisMonth}</strong>
                  <span>{paidThisMonth === 1 ? 'já pagou' : 'já pagaram'}</span>
                </div>
                <div className="apt-month-stat apt-month-stat-due">
                  <strong>{dueThisMonth}</strong>
                  <span>{dueThisMonth === 1 ? 'ainda falta' : 'ainda faltam'}</span>
                </div>
                {confirmingThisMonth > 0 ? (
                  <div className="apt-month-stat apt-month-stat-confirm">
                    <strong>{confirmingThisMonth}</strong>
                    <span>a confirmar</span>
                  </div>
                ) : null}
              </div>
              <p className="apt-month-money">Recebido <strong>{finances ? money(finances.monthlyConfirmedPayments) : '€0'}</strong> de {money(expectedThisMonth)} este mês</p>
            </section>

            <section className="apt-list" aria-label="Os meus apartamentos">
              {apartments.map((apt) => (
                <ApartmentCard
                  key={apt.unit.id as string}
                  apt={apt}
                  onOpen={setOpenApartmentId}
                  onMarkPaid={markApartmentPaid}
                  paying={payingUnitId === (apt.unit.id as string)}
                />
              ))}
            </section>

            <a className="apt-add" href="/portfolio">+ Adicionar apartamento</a>
          </>
        )}
      </> : null}

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
          <SetupStepCard number={4} title="Criar contrato" description={renterOptions.length ? 'Associe imóvel, unidade e inquilino.' : 'Disponível depois do primeiro inquilino.'} status={!renterOptions.length ? 'locked' : state.leases.length ? 'completed' : 'available'} href="/leases" />
        </div>
        ) : null}

        {setupComplete && !currentSetupStep && editing ? (
          <EditEntityForm editing={editing} onSubmit={postJson} onDone={() => setEditing(null)} setNotice={setNotice} />
        ) : null}

        {setupComplete && !currentSetupStep && !editing ? (
        <>
          <div className="stat-tiles">
            <div className="stat-tile"><span className="stat-label">Imóveis</span><strong className="stat-value">{state.properties.length}</strong></div>
            <div className="stat-tile"><span className="stat-label">Unidades</span><strong className="stat-value">{state.units.length}</strong></div>
            <div className="stat-tile stat-tile-positive"><span className="stat-label">Ocupadas</span><strong className="stat-value">{state.units.filter((unit) => unit.status === 'Occupied').length}</strong></div>
            <div className="stat-tile stat-tile-warning"><span className="stat-label">Vagas</span><strong className="stat-value">{state.units.filter((unit) => unit.status === 'Vacant').length}</strong></div>
            {state.units.filter((unit) => unit.status !== 'Occupied' && unit.status !== 'Vacant').length ? <div className="stat-tile"><span className="stat-label">Em manutenção</span><strong className="stat-value">{state.units.filter((unit) => unit.status !== 'Occupied' && unit.status !== 'Vacant').length}</strong></div> : null}
          </div>
          <div className="grid-2">
            {state.properties.map((property) => <PropertyCard key={property.id as string} property={property} onEditProperty={(p) => setEditing({ type: 'property', data: p })} onEditUnit={(u) => setEditing({ type: 'unit', data: u })} />)}
          </div>
          {state.renters.length ? (
            <article className="card">
              <div className="card-header"><h2>Inquilinos</h2><span>{state.renters.length} {state.renters.length === 1 ? 'registado' : 'registados'}</span></div>
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
              </div></div>
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
                {lease.status === 'Active' ? (
                  <div className="form-actions" style={{ marginTop: 10 }}>
                    <button
                      className="small-button small-button-danger"
                      type="button"
                      disabled={submitting === '/api/leases'}
                      onClick={() => {
                        if (window.confirm('Terminar este contrato? A unidade fica livre para um novo arrendamento.')) {
                          void postJson('/api/leases', { leaseId: lease.id, status: 'Ended' }, 'Contrato terminado. A unidade ficou livre.', 'PATCH')
                        }
                      }}
                    >
                      {submitting === '/api/leases' ? 'A terminar...' : 'Terminar contrato'}
                    </button>
                  </div>
                ) : null}
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
        {state.invoices.length > 0 ? (
          <div className="stat-tiles">
            <div className="stat-tile stat-tile-danger"><span className="stat-label">Em atraso</span><strong className="stat-value">{overdueInvoices.length}</strong></div>
            <div className="stat-tile stat-tile-warning"><span className="stat-label">Por receber</span><strong className="stat-value">{state.invoices.filter((invoice) => invoice.status === 'Pending' || invoice.status === 'Partial' || invoice.status === 'AwaitingConfirmation').length}</strong></div>
            <div className="stat-tile stat-tile-positive"><span className="stat-label">Recebidas</span><strong className="stat-value">{state.invoices.filter((invoice) => invoice.status === 'Paid').length}</strong></div>
            <div className="stat-tile stat-tile-danger"><span className="stat-label">Total em atraso</span><strong className="stat-value">{money(overdueTotal)}</strong></div>
          </div>
        ) : null}
        <div className="grid-2">
          <Panel title="Gerar cobranças" subtitle="Cobrança mensal automática">
            {activeLeaseCount === 0 ? <SmartEmptyState title="Ainda não existem contratos ativos" description="Crie um contrato antes de gerar as cobranças mensais." actionLabel="Criar contrato" actionHref="/leases" /> : <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/invoices/generate', payload(form), 'Cobranças criadas. Já pode acompanhar e enviar lembretes aos inquilinos.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar as cobranças.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="invoice-period">Período</label><input id="invoice-period" name="period" type="month" defaultValue={new Date().toISOString().slice(0, 7)} /></div>
                <div className="information-tile"><span>Contratos ativos</span><strong>{activeLeaseCount}</strong><small>Disponíveis para cobrança</small></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/invoices/generate'}>{submitting === '/api/invoices/generate' ? 'A gerar...' : `Gerar cobranças de ${periodLabel(new Date().toISOString().slice(0, 7))}`}</button></div>
            </form>}
            {state.invoices.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <div className="chips portfolio-summary" style={{ marginBottom: 10 }}>
                  {overdueInvoices.length
                    ? <span className="chip chip-danger">{overdueInvoices.length} em atraso · {money(overdueTotal)}</span>
                    : <span className="chip chip-positive">Sem rendas em atraso</span>}
                </div>
                <div className="field" style={{ marginBottom: 12 }}>
                  <label htmlFor="invoice-filter">Mostrar</label>
                  <select id="invoice-filter" value={invoiceFilter} onChange={(event) => setInvoiceFilter(event.target.value as 'all' | 'overdue' | 'open')}>
                    <option value="all">Todas as cobranças</option>
                    <option value="overdue">Só em atraso</option>
                    <option value="open">Por receber</option>
                  </select>
                </div>
              </div>
            ) : null}
            {activeLeaseCount > 0 || state.invoices.length > 0 ? <RecordList items={visibleInvoices} empty={{ title: invoiceFilter === 'all' ? 'Ainda não existem cobranças.' : 'Nenhuma cobrança com este filtro.', hint: invoiceFilter === 'all' ? 'Escolha o período e gere as cobranças para os contratos ativos.' : 'Experimente mudar o filtro acima.', actionLabel: 'Gerar cobranças agora', actionHref: '#invoice-period' }} render={(invoice) => (
              <div key={invoice.id} className="empty">
                <strong>{invoice.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{periodLabel(invoice.period as string)} · {money(Number(invoice.amount ?? 0))} · vence {date(invoice.dueDate)}</span><br />
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
            {state.payments.length > 0 ? <RecordList items={state.payments} empty={{ title: 'Ainda não existem pagamentos registados.', hint: 'Quando uma cobrança for paga, poderá registar o pagamento aqui.', actionLabel: 'Ver cobranças', actionHref: '#invoice-period' }} render={(payment) => {
              const confirmed = payment.confirmationStatus === 'Confirmed'
              return (
              <div key={payment.id} className="empty">
                <strong>{payment.invoice?.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{dateTime(payment.paidAt)} · {money(Number(payment.amount ?? 0))} · {paymentMethodLabel(payment.method as string)}</span><br />
                <span className={confirmed ? 'chip chip-positive' : 'chip chip-warning'}>{confirmed ? 'Confirmado' : 'A aguardar confirmação'}</span>
                {!confirmed ? (
                  <div className="form-actions" style={{ marginTop: 10 }}>
                    <button
                      className="small-button"
                      type="button"
                      disabled={submitting === `/api/payments/${payment.id as string}/confirm`}
                      onClick={() => void postJson(`/api/payments/${payment.id as string}/confirm`, {}, 'Pagamento confirmado. Já entra no resumo financeiro.')}
                    >
                      {submitting === `/api/payments/${payment.id as string}/confirm` ? 'A confirmar...' : 'Confirmar pagamento'}
                    </button>
                  </div>
                ) : null}
              </div>
              )
            }} /> : null}
          </Panel>
        </div>
        <div className="grid-2" style={{ marginTop: 16 }}>
          <Panel title="Registar despesa" subtitle="Custos por imóvel para o lucro líquido">
            {propertyOptions.length === 0 ? <SmartEmptyState title="Ainda não existem imóveis" description="Adicione um imóvel antes de registar despesas." actionLabel="Adicionar imóvel" actionHref="/portfolio" /> : <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/expenses', payload(form), 'Despesa registada.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar a despesa.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="expense-category">Categoria</label><select id="expense-category" name="category" defaultValue="Manutenção"><option value="Manutenção">Manutenção</option><option value="Condomínio">Condomínio</option><option value="IMI">IMI</option><option value="Seguro">Seguro</option><option value="Água">Água</option><option value="Eletricidade">Eletricidade</option><option value="Gás">Gás</option><option value="Limpeza">Limpeza</option><option value="Outros">Outros</option></select></div>
                <div className="field"><label htmlFor="expense-amount">Valor</label><input id="expense-amount" name="amount" type="number" step="0.01" required /></div>
                <div className="field"><label htmlFor="expense-property">Imóvel</label><select id="expense-property" name="propertyId" required defaultValue=""><option value="" disabled>Selecionar imóvel</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field"><label htmlFor="expense-date">Data</label><input id="expense-date" name="incurredAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></div>
                <div className="field field-full"><label htmlFor="expense-description">Descrição</label><input id="expense-description" name="description" placeholder="Ex.: Reparação de canalização" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/expenses'}>{submitting === '/api/expenses' ? 'A registar...' : 'Registar despesa'}</button></div>
            </form>}
          </Panel>

          <Panel title="Despesas recentes" subtitle={`${state.expenses.length} ${state.expenses.length === 1 ? 'registada' : 'registadas'}`}>
            <RecordList items={state.expenses} empty={{ title: 'Ainda não existem despesas.', hint: 'Registe custos (manutenção, IMI, seguros...) para o lucro líquido refletir a realidade.', actionLabel: 'Registar despesa', actionHref: '#expense-category' }} render={(expense) => (
              <div key={expense.id} className="empty">
                <strong>{expense.category as string}</strong><br />
                <span className="muted">{money(Number(expense.amount ?? 0))} · {(expense.property?.name as string) ?? (expense.lease?.property?.name as string) ?? '—'} · {date(expense.incurredAt)}</span>
                {expense.description ? <><br /><span className="muted">{expense.description as string}</span></> : null}
                <div className="form-actions" style={{ marginTop: 10 }}>
                  <button className="small-button small-button-danger" type="button" onClick={() => { if (window.confirm('Apagar esta despesa?')) { void postJson(`/api/expenses/${expense.id as string}`, {}, 'Despesa apagada.', 'DELETE') } }}>Apagar</button>
                </div>
              </div>
            )} />
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
