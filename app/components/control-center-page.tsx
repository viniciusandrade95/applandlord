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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0
  )
}

function date(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
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

function dateTime(value?: string | Date | null) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(parsed)
}

function periodLabel(period?: string) {
  if (!period) return '—'
  const [year, month] = period.split('-')
  const parsed = new Date(Number(year), Number(month) - 1, 1)
  if (Number.isNaN(parsed.getTime())) return period
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parsed)
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

type IconName =
  | 'building' | 'income' | 'check' | 'tools' | 'arrow'
  | 'wallet' | 'clock' | 'calendar' | 'user' | 'phone' | 'plus' | 'euro' | 'alert' | 'key' | 'pencil'

function UiIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    building: <><path d="M4 21V5l8-3v19M12 8h8v13M8 7v2M8 12v2M8 17v2M16 12v2M16 17v2M2 21h20" /></>,
    income: <><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /><path d="M2 21h22" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
    tools: <><path d="m14 7 3-3 3 3-3 3M5 19l9-9M4 14l6 6" /></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    wallet: <><path d="M4 7h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z" /><path d="M4 7V6a2 2 0 0 1 2-2h9v3" /><path d="M16 12.5h4v4h-4a2 2 0 0 1 0-4Z" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
    calendar: <><rect x="3" y="4.5" width="18" height="16.5" rx="2.5" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>,
    user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
    phone: <><path d="M4 4.5h4l2 5-2.5 1.6a12.5 12.5 0 0 0 5.4 5.4L18 14l5 2v4a2 2 0 0 1-2.2 2A18.5 18.5 0 0 1 2 6.7 2 2 0 0 1 4 4.5Z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    euro: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5h.01M18 14.5h.01" /></>,
    alert: <><path d="M12 3.2 2.2 20.5h19.6z" /><path d="M12 10v4.5M12 18h.01" /></>,
    key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8 2 2M17 6l2 2" /></>,
    pencil: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>,
  }

  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

// Iniciais do inquilino para o avatar (ex.: "Carla Mendes" -> "CM").
function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return (first + last).toUpperCase()
}

// Cor determinística (forte, não pastel) para o avatar do inquilino, a partir do nome.
const AVATAR_COLORS = ['#0f766e', '#4f46e5', '#b45309', '#be185d', '#0369a1', '#7c3aed']
function avatarColor(seed: string) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
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

type Apartment = {
  unit: Row
  property: Row | null
  lease: Row | null
  renter: Row | null
  currentInvoice: Row | null
  monthStatus: 'paid' | 'confirming' | 'due' | 'vacant'
  rent: number
  title: string   // identificador = morada (Rua + nº)
  label: string   // nome opcional (só quando difere da morada)
  address: string // cidade / linha secundária
  openTickets: number
}

const EXPENSE_CATEGORIES = ['Manutenção', 'Condomínio', 'IPTU', 'Seguro', 'Água', 'Energia', 'Gás', 'Limpeza', 'Outros'] as const

const STATUS_WORD: Record<Apartment['monthStatus'], string> = {
  paid: 'Pago',
  confirming: 'A confirmar',
  due: 'Por pagar',
  vacant: 'Vago',
}

// Marca de estado à direita do cartão: cor apenas no texto e na marca (sem fundos pastel).
function StatusMark({ status }: { status: Apartment['monthStatus'] }) {
  return (
    <span className={`apt-status apt-status-${status}`}>
      {status === 'paid'
        ? <svg className="apt-status-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12.5 5 5L20 6.5" /></svg>
        : <span className="apt-status-dot" aria-hidden="true" />}
      <span>{STATUS_WORD[status]}</span>
    </span>
  )
}

/**
 * Cartão de um apartamento. Desenho intencional: ícone à esquerda; nome + estado no topo
 * (o estado é a âncora, à direita); inquilino e renda por baixo; e um rodapé discreto só
 * quando há contrato/avarias. Fundo branco, sem listras nem pastéis.
 */
function ApartmentCard({ apt, onOpen, onMarkPaid, paying }: {
  apt: Apartment
  onOpen: (unitId: string) => void
  onMarkPaid: (apt: Apartment) => void
  paying: boolean
}) {
  const { unit, lease, renter, monthStatus, rent, title, label, openTickets } = apt
  const tenantName = (renter?.fullName as string) || ''
  return (
    <div className="apt-card">
      <button className="apt-card-main" type="button" data-apt-card={unit.id as string} aria-label={`Abrir ${title}`} onClick={() => onOpen(unit.id as string)}>
        {renter
          ? <span className="apt-avatar" style={{ background: avatarColor(tenantName) }}>{initials(tenantName)}</span>
          : <span className="apt-avatar apt-avatar-vacant"><UiIcon name="key" /></span>}
        <span className="apt-card-body">
          <span className="apt-card-top">
            <span className="apt-card-titles">
              {label ? <span className="apt-card-label">{label}</span> : null}
              <strong className="apt-card-title">{title}</strong>
            </span>
            <StatusMark status={monthStatus} />
          </span>
          <span className="apt-card-tenant">{renter ? tenantName : 'Sem inquilino'}</span>
          <span className="apt-card-facts">
            {renter ? <span className="apt-fact"><UiIcon name="euro" />{money(rent)}</span> : null}
            {lease?.endDate ? <span className="apt-fact"><UiIcon name="calendar" />{date(lease.endDate)}</span> : null}
            {openTickets > 0 ? <span className="apt-fact apt-fact-alert" aria-label={`${openTickets} ${openTickets === 1 ? 'avaria' : 'avarias'}`}><UiIcon name="tools" />{openTickets}</span> : null}
          </span>
        </span>
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
function ApartmentDetail({ apt, payments, expenses, submitting, onMarkPaid, paying, onEdit, onAddExpense, onDeleteExpense }: {
  apt: Apartment
  payments: Row[]
  expenses: Row[]
  submitting: string | null
  onMarkPaid: (apt: Apartment) => void
  paying: boolean
  onEdit: (apt: Apartment) => void
  onAddExpense: (apt: Apartment, form: HTMLFormElement) => void
  onDeleteExpense: (id: string) => void
}) {
  const { property, lease, renter, monthStatus, rent, label, address, openTickets } = apt
  const phone = renter?.phone ? String(renter.phone) : ''
  const leasePayments = lease
    ? payments.filter((payment) => (payment.invoice?.lease?.id as string) === (lease.id as string))
    : []
  const propertyId = property?.id as string | undefined
  const apartmentExpenses = propertyId
    ? expenses.filter((expense) => ((expense.property?.id ?? expense.propertyId ?? expense.lease?.property?.id) as string) === propertyId)
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
      <p className="apt-detail-address">{label ? `${label} · ${address}` : address}</p>

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
          <h2>Inquilino e contrato</h2>
          <dl className="apt-facts">
            <div><dt>Nome</dt><dd>{(renter?.fullName as string) ?? '—'}</dd></div>
            <div><dt>Telefone</dt><dd>{phone ? <a href={`tel:${phone}`}>{phone}</a> : '—'}</dd></div>
            <div><dt>Renda</dt><dd>{money(rent)} por mês</dd></div>
            <div><dt>Contrato desde</dt><dd>{date(lease.startDate)}</dd></div>
            {lease.endDate ? <div><dt>Termina</dt><dd>{date(lease.endDate)}</dd></div> : null}
            <div><dt>Avarias abertas</dt><dd>{openTickets > 0 ? `${openTickets}` : 'Nenhuma'}</dd></div>
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

      <div className="apt-detail-card">
        <h2>Contas e despesas</h2>
        {apartmentExpenses.length ? (
          <ul className="apt-history">
            {apartmentExpenses.slice(0, 8).map((expense) => (
              <li key={expense.id as string}>
                <span className="apt-history-date">{(expense.category as string) || 'Despesa'} · {date(expense.incurredAt)}</span>
                <strong>{money(Number(expense.amount ?? 0))}</strong>
                <button
                  className="apt-mini-delete"
                  type="button"
                  aria-label={`Apagar despesa de ${money(Number(expense.amount ?? 0))}`}
                  disabled={submitting === `/api/expenses/${expense.id as string}`}
                  onClick={() => { if (window.confirm('Apagar esta conta?')) onDeleteExpense(expense.id as string) }}
                >Apagar</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Ainda não há contas registadas neste apartamento.</p>}

        {propertyId ? (
          <form
            className="apt-bill-form"
            onSubmit={(event) => { event.preventDefault(); onAddExpense(apt, event.currentTarget) }}
          >
            <div className="apt-bill-grid">
              <div className="field">
                <label htmlFor="bill-category">Tipo de conta</label>
                <select id="bill-category" name="category" defaultValue="Condomínio">
                  {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="bill-amount">Valor (R$)</label>
                <input id="bill-amount" name="amount" type="number" step="0.01" min="0.01" required />
              </div>
              <div className="field">
                <label htmlFor="bill-date">Data</label>
                <input id="bill-date" name="incurredAt" type="date" defaultValue={todayISO()} />
              </div>
              <div className="field field-full">
                <label htmlFor="bill-desc">Descrição (opcional)</label>
                <input id="bill-desc" name="description" placeholder="Ex.: Condomínio de julho" />
              </div>
            </div>
            <button className="button button-primary" type="submit" disabled={submitting === '/api/expenses'}>
              {submitting === '/api/expenses' ? 'A registar…' : 'Adicionar conta'}
            </button>
          </form>
        ) : null}
      </div>

      <div className="apt-detail-links">
        <button type="button" onClick={() => onEdit(apt)}>Editar apartamento</button>
        <a href="/operations">Registar uma avaria</a>
      </div>
    </section>
  )
}

/**
 * Formulário único para adicionar ou editar um apartamento. Esconde o conceito de "unidade":
 * a senhora preenche nome, morada e renda, e por trás criamos/atualizamos imóvel + unidade.
 */
function ApartmentForm({ apt, onSubmit, onCancel, submitting }: {
  apt: Apartment | null
  onSubmit: (form: HTMLFormElement) => void
  onCancel: () => void
  submitting: boolean
}) {
  const property = apt?.property
  const unit = apt?.unit
  const isEdit = !!apt
  // O nome só é mostrado quando é um rótulo próprio (diferente da morada).
  const aptName = property && (property.name as string) !== (property.addressLine1 as string) ? (property.name as string) : ''
  return (
    <section className="apt-form-card">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget) }}>
        <div className="apt-bill-grid">
          <div className="field field-full">
            <label htmlFor="apt-address">Endereço <span className="apt-req">obrigatória</span></label>
            <input id="apt-address" name="addressLine1" autoComplete="address-line1" defaultValue={(property?.addressLine1 as string) ?? ''} placeholder="Ex.: Rua das Flores, 12, 3.º Esq." required />
          </div>
          <div className="field field-full">
            <label htmlFor="apt-name">Nome <span className="apt-optional">opcional</span></label>
            <input id="apt-name" name="name" defaultValue={aptName} placeholder="Um nome à sua escolha (ex.: Casa das Flores)" />
          </div>
          <div className="field">
            <label htmlFor="apt-city">Cidade</label>
            <input id="apt-city" name="city" autoComplete="address-level2" defaultValue={(property?.city as string) ?? ''} required />
          </div>
          <div className="field">
            <label htmlFor="apt-postal">CEP</label>
            <input id="apt-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" defaultValue={(property?.postalCode as string) ?? ''} placeholder="0000-000" required />
          </div>
          <div className="field field-full">
            <label htmlFor="apt-rent">Aluguel mensal (R$)</label>
            <input id="apt-rent" name="monthlyRent" type="number" step="1" min="1" defaultValue={unit ? Number(unit.monthlyRent ?? 0) : ''} required />
          </div>
        </div>
        <div className="apt-form-actions">
          <button className="button button-primary" type="submit" disabled={submitting}>
            {submitting ? 'A guardar…' : isEdit ? 'Guardar alterações' : 'Adicionar apartamento'}
          </button>
          <button className="button button-secondary" type="button" onClick={onCancel}>Cancelar</button>
        </div>
      </form>
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
  const [addingApartment, setAddingApartment] = useState(false)
  const [editingApartment, setEditingApartment] = useState<Apartment | null>(null)
  const [apartmentQuery, setApartmentQuery] = useState('')
  const [isDemoUser, setIsDemoUser] = useState(false)
  const currentPeriod = new Date().toISOString().slice(0, 7)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prevViewRef = useRef<string>('list')

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

  // Deteta a conta de demonstração para mostrar o botão "carregar dados demo".
  useEffect(() => {
    let active = true
    fetch('/api/auth/session')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (active && data?.user?.email === 'adilson@teste.com') setIsDemoUser(true) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  async function loadDemoData() {
    if (submitting) return
    if (!window.confirm('Isto carrega 2 apartamentos de exemplo (substitui o que existir nesta conta demo). Continuar?')) return
    setSubmitting('demo')
    try {
      await apiSend('/api/demo/seed', {})
      setNotice({ kind: 'success', text: 'Dados de demonstração carregados.' })
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar os dados demo.' })
    } finally {
      setSubmitting(null)
    }
  }

  // Reconcilia: se o apartamento aberto deixar de existir (ex.: removido noutra sessão), fecha o detalhe.
  useEffect(() => {
    if (openApartmentId && !loading && !state.units.some((unit) => (unit.id as string) === openApartmentId)) {
      setOpenApartmentId(null)
    }
  }, [openApartmentId, loading, state.units])

  // Gestão de foco ao navegar entre lista / detalhe / adicionar / editar, para quem usa teclado
  // ou leitor de ecrã não perder o sítio: ao entrar numa subvista foca o título; ao voltar à
  // lista devolve o foco ao cartão de onde saiu.
  const focusViewKey = addingApartment
    ? 'add'
    : editingApartment
      ? `edit:${editingApartment.unit.id as string}`
      : openApartmentId
        ? `detail:${openApartmentId}`
        : 'list'
  useEffect(() => {
    const previous = prevViewRef.current
    if (focusViewKey !== previous) {
      if (focusViewKey === 'list') {
        const originId = previous.startsWith('detail:') ? previous.slice('detail:'.length) : null
        const card = originId ? document.querySelector<HTMLButtonElement>(`[data-apt-card="${originId}"]`) : null
        if (card) card.focus()
        else headingRef.current?.focus()
      } else {
        headingRef.current?.focus()
      }
    }
    prevViewRef.current = focusViewKey
  }, [focusViewKey])

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
        setNotice({ kind: 'success', text: 'Este aluguel já foi marcado como pago.' })
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
      setNotice({ kind: 'success', text: `Aluguel de ${(apt.renter?.fullName as string) ?? 'inquilino'} marcada como paga.` })
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar como pago.' })
    } finally {
      setPayingUnitId(null)
    }
  }

  // Esconde o conceito de "unidade": um apartamento = imóvel + a sua unidade, criados/atualizados
  // atomicamente por /api/apartments (transação) — sem imóvel órfão nem escrita parcial.
  async function addApartment(form: HTMLFormElement) {
    if (submitting) return
    const data = payload(form)
    setSubmitting('add-apartment')
    try {
      await apiSend('/api/apartments', {
        name: data.name,
        addressLine1: data.addressLine1,
        city: data.city,
        postalCode: data.postalCode,
        monthlyRent: Number(data.monthlyRent),
      })
      setNotice({ kind: 'success', text: 'Apartamento adicionado.' })
      setAddingApartment(false)
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível adicionar o apartamento.' })
    } finally {
      setSubmitting(null)
    }
  }

  async function updateApartment(apt: Apartment, form: HTMLFormElement) {
    if (submitting || !apt.property) return
    const data = payload(form)
    setSubmitting('edit-apartment')
    try {
      await apiSend('/api/apartments', {
        propertyId: apt.property.id,
        unitId: apt.unit.id,
        name: data.name,
        addressLine1: data.addressLine1,
        city: data.city,
        postalCode: data.postalCode,
        monthlyRent: Number(data.monthlyRent),
      }, 'PATCH')
      setNotice({ kind: 'success', text: 'Apartamento atualizado.' })
      setEditingApartment(null)
      await load()
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível guardar as alterações.' })
    } finally {
      setSubmitting(null)
    }
  }

  async function addApartmentExpense(apt: Apartment, form: HTMLFormElement) {
    if (!apt.property || submitting) return
    const data = payload(form)
    try {
      await postJson('/api/expenses', { ...data, propertyId: apt.property.id }, 'Conta registada.')
      form.reset() // só limpa após sucesso real (o guard acima evita limpar quando outra ação está a decorrer)
    } catch {
      // erro já mostrado por postJson
    }
  }

  function deleteApartmentExpense(id: string) {
    void postJson(`/api/expenses/${id}`, {}, 'Conta apagada.', 'DELETE')
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
        // O identificador é a morada (Rua + nº). O nome é um rótulo opcional (só se diferir da morada).
        // Se o imóvel tiver mais que uma unidade, juntamos o nome da unidade para desambiguar.
        const addressLine = (property?.addressLine1 as string) || (unit.name as string) || 'Apartamento'
        const propertyUnitCount = state.units.filter((item) => (item.propertyId as string) === (unit.propertyId as string)).length
        const title = propertyUnitCount > 1 ? `${addressLine} · ${unit.name as string}` : addressLine
        const customName = (property?.name as string) || ''
        const label = customName && customName !== addressLine ? customName : ''
        const address = (property?.city as string) || ''
        const openTickets = state.maintenance.filter((ticket) => {
          // Ticket com unidade específica conta só nessa unidade; sem unidade, conta no imóvel.
          const matches = ticket.unitId
            ? (ticket.unitId as string) === (unit.id as string)
            : (!!property && (ticket.propertyId as string) === (property.id as string))
          return matches && ticket.status !== 'Resolved' && ticket.status !== 'Closed'
        }).length
        return { unit, property, lease, renter, currentInvoice, monthStatus, rent, title, label, address, openTickets }
      })
      .sort((a, b) => order[a.monthStatus] - order[b.monthStatus])
  }, [state.units, state.leases, state.properties, state.invoices, state.maintenance, currentPeriod])

  const openApartment = openApartmentId ? apartments.find((apt) => (apt.unit.id as string) === openApartmentId) ?? null : null
  const occupiedApartments = apartments.filter((apt) => apt.lease)
  const paidThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'paid').length
  const dueThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'due').length
  const confirmingThisMonth = occupiedApartments.filter((apt) => apt.monthStatus === 'confirming').length
  const expectedThisMonth = occupiedApartments.reduce((sum, apt) => sum + apt.rent, 0)
  // Recebido = soma dos pagamentos confirmados das faturas deste mês (dinheiro real, não renda nominal).
  const receivedThisMonth = state.payments
    .filter((payment) => payment.confirmationStatus === 'Confirmed' && ((payment.invoice?.period) as string) === currentPeriod)
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const openTicketsTotal = state.maintenance.filter((ticket) => ticket.status !== 'Resolved' && ticket.status !== 'Closed').length
  const awaitingPayments = state.payments.filter((payment) => payment.confirmationStatus !== 'Confirmed')
  const apartmentSearch = apartmentQuery.trim().toLowerCase()
  const visibleApartments = apartmentSearch
    ? apartments.filter((apt) =>
        apt.title.toLowerCase().includes(apartmentSearch) ||
        apt.label.toLowerCase().includes(apartmentSearch) ||
        apt.address.toLowerCase().includes(apartmentSearch) ||
        ((apt.renter?.fullName as string) ?? '').toLowerCase().includes(apartmentSearch)
      )
    : apartments

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
            {addingApartment || editingApartment || openApartment
              ? <button className="apt-back" type="button" onClick={() => {
                  if (addingApartment) setAddingApartment(false)
                  else if (editingApartment) setEditingApartment(null)
                  else setOpenApartmentId(null)
                }}>{editingApartment ? '‹ Voltar' : '‹ Os meus apartamentos'}</button>
              : <p className="screen-kicker">A sua gestão, simples e clara</p>}
            <h1 ref={headingRef} tabIndex={-1}>
              {addingApartment ? 'Adicionar apartamento' : editingApartment ? 'Editar apartamento' : openApartment ? openApartment.title : 'Os meus apartamentos'}
            </h1>
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
        ) : addingApartment ? (
          <ApartmentForm apt={null} onSubmit={addApartment} onCancel={() => setAddingApartment(false)} submitting={submitting === 'add-apartment'} />
        ) : editingApartment ? (
          <ApartmentForm apt={editingApartment} onSubmit={(form) => { if (editingApartment) updateApartment(editingApartment, form) }} onCancel={() => setEditingApartment(null)} submitting={submitting === 'edit-apartment'} />
        ) : apartments.length === 0 ? (
          <div className="apt-empty-home">
            <span className="apt-empty-avatar"><UiIcon name="building" /></span>
            <h2>Ainda não tem apartamentos</h2>
            <p>Adicione o seu primeiro apartamento para começar a acompanhar rendas e contas.</p>
            <button className="button button-primary" type="button" onClick={() => setAddingApartment(true)}>Adicionar apartamento</button>
            {isDemoUser ? (
              <button className="apt-demo-link" type="button" disabled={submitting === 'demo'} onClick={loadDemoData}>
                {submitting === 'demo' ? 'A carregar…' : 'Carregar dados de demonstração'}
              </button>
            ) : null}
          </div>
        ) : openApartment ? (
          <ApartmentDetail
            apt={openApartment}
            payments={state.payments}
            expenses={state.expenses}
            submitting={submitting}
            onMarkPaid={markApartmentPaid}
            paying={payingUnitId === (openApartment.unit.id as string)}
            onEdit={(apt) => setEditingApartment(apt)}
            onAddExpense={addApartmentExpense}
            onDeleteExpense={deleteApartmentExpense}
          />
        ) : (
          <>
            <section className="apt-hero" aria-label="Resumo deste mês">
              <p className="apt-hero-kicker"><UiIcon name="calendar" />Este mês</p>
              <p className="apt-hero-amount">
                <strong>{money(receivedThisMonth)}</strong>
                <span>de {money(expectedThisMonth)}</span>
              </p>
              <div className="apt-progress" role="img" aria-label={`Recebido ${money(receivedThisMonth)} de ${money(expectedThisMonth)} previstos`}>
                <span className="apt-progress-fill" style={{ width: `${expectedThisMonth > 0 ? Math.min(100, Math.round((receivedThisMonth / expectedThisMonth) * 100)) : 0}%` }} />
              </div>
              <div className="apt-hero-chips">
                <span className="apt-hero-chip apt-hero-chip-paid"><UiIcon name="check" />{paidThisMonth} {paidThisMonth === 1 ? 'pago' : 'pagos'}</span>
                <span className="apt-hero-chip apt-hero-chip-due"><UiIcon name="clock" />{dueThisMonth} por pagar</span>
                {confirmingThisMonth > 0 ? <span className="apt-hero-chip apt-hero-chip-confirm"><UiIcon name="clock" />{confirmingThisMonth} a confirmar</span> : null}
              </div>
            </section>

            <div className="apt-stats" role="group" aria-label="Resumo do portfólio">
              <div className="apt-stat" role="img" aria-label={`${apartments.length} ${apartments.length === 1 ? 'apartamento' : 'apartamentos'}`}>
                <span className="apt-stat-ic"><UiIcon name="building" /></span>
                <strong aria-hidden="true">{apartments.length}</strong>
              </div>
              <div className={`apt-stat ${dueThisMonth > 0 ? 'apt-stat-warn' : ''}`} role="img" aria-label={`${dueThisMonth} em atraso`}>
                <span className="apt-stat-ic"><UiIcon name="alert" /></span>
                <strong aria-hidden="true">{dueThisMonth}</strong>
              </div>
              <div className={`apt-stat ${openTicketsTotal > 0 ? 'apt-stat-warn' : ''}`} role="img" aria-label={`${openTicketsTotal} ${openTicketsTotal === 1 ? 'avaria' : 'avarias'}`}>
                <span className="apt-stat-ic"><UiIcon name="tools" /></span>
                <strong aria-hidden="true">{openTicketsTotal}</strong>
              </div>
            </div>

            <div className="apt-search">
              <span className="apt-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
              </span>
              <input
                type="search"
                value={apartmentQuery}
                onChange={(event) => setApartmentQuery(event.target.value)}
                placeholder="Procurar apartamento ou inquilino…"
                aria-label="Procurar apartamento"
              />
              <p className="sr-only" role="status" aria-live="polite">
                {apartmentQuery ? `${visibleApartments.length} ${visibleApartments.length === 1 ? 'apartamento encontrado' : 'apartamentos encontrados'}` : ''}
              </p>
            </div>

            <section className="apt-list" aria-label="Os meus apartamentos">
              {visibleApartments.length ? visibleApartments.map((apt) => (
                <ApartmentCard
                  key={apt.unit.id as string}
                  apt={apt}
                  onOpen={setOpenApartmentId}
                  onMarkPaid={markApartmentPaid}
                  paying={payingUnitId === (apt.unit.id as string)}
                />
              )) : <p className="muted" style={{ padding: '8px 2px' }}>Nenhum apartamento corresponde à pesquisa.</p>}
            </section>

            <button className="apt-add" type="button" onClick={() => setAddingApartment(true)}>+ Adicionar apartamento</button>
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
          <div className="prop-summary">
            <div className="prop-sum-tile" aria-label={`${state.properties.length} imóveis`}><UiIcon name="building" /><strong>{state.properties.length}</strong><span>imóveis</span></div>
            <div className="prop-sum-tile prop-sum-occ" aria-label={`${state.units.filter((unit) => unit.status === 'Occupied').length} ocupadas`}><UiIcon name="check" /><strong>{state.units.filter((unit) => unit.status === 'Occupied').length}</strong><span>ocupadas</span></div>
            <div className="prop-sum-tile prop-sum-free" aria-label={`${state.units.filter((unit) => unit.status === 'Vacant').length} livres`}><UiIcon name="key" /><strong>{state.units.filter((unit) => unit.status === 'Vacant').length}</strong><span>livres</span></div>
            <div className="prop-sum-tile prop-sum-rent" aria-label="renda mensal ocupada"><UiIcon name="euro" /><strong>{money(state.units.reduce((sum, unit) => sum + (unit.status === 'Occupied' ? Number(unit.monthlyRent ?? 0) : 0), 0))}</strong><span>por mês</span></div>
          </div>
          <div className="prop-grid">
            {state.properties.map((property) => <PropertyCard key={property.id as string} property={property} onEditProperty={(p) => setEditing({ type: 'property', data: p })} />)}
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
              {state.expenses.slice(0, 12).map((expense) => (
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
          <span className="pill pill-soft">Pedidos: {filteredTickets.length}/{state.maintenance.length}</span>
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
            {state.maintenance.length > 0 ? <div className="form-grid" style={{ marginBottom: 12 }}>
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
