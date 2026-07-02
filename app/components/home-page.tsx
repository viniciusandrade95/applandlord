'use client'

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { ApartmentVM } from '@/lib/apartments'
import { appVersion } from '@/lib/version'
import {
  EXPENSE_CATEGORIES,
  Notice,
  Paged,
  Row,
  UiIcon,
  apiErrorMessage,
  avatarColor,
  date,
  initials,
  money,
  payload,
  todayISO,
} from '@/app/components/shared'

/**
 * Página inicial (assistente do senhorio), desenhada para escalar:
 * - /api/home devolve o agregado (tarefas top-5 + contagens + resumo do mês) — payload constante;
 * - /api/apartments devolve páginas de view-models (24 por página, "Ver mais" para seguir);
 * - a pesquisa é server-side (debounce), nunca filtra coleções no browser;
 * - "Marcar como pago" é UM pedido atómico e atualiza só o cartão afetado (sem reload global);
 * - o detalhe de um apartamento é carregado à parte (pagamentos/contas limitados no servidor).
 */

type HomeTask = { unitId: string; tenantName: string | null; rent: number; title: string; days?: number | null }

type HomeData = {
  period: string
  month: { received: number; expected: number; paidCount: number; dueCount: number; confirmingCount: number }
  tasks: {
    due: HomeTask[]
    dueTotal: number
    confirming: HomeTask[]
    confirmingTotal: number
    endingSoon: HomeTask[]
    endingSoonTotal: number
    openTickets: number
  }
  stats: { apartments: number; dueCount: number; openTickets: number }
}

type ApartmentDetailData = {
  apartment: ApartmentVM
  payments: Array<{ id: string; amount: number; paidAt: string | null; confirmationStatus: string }>
  expenses: Array<{ id: string; category: string; description: string | null; amount: number; incurredAt: string | null }>
}

const STATUS_WORD: Record<ApartmentVM['monthStatus'], string> = {
  paid: 'Pago',
  confirming: 'A confirmar',
  due: 'Por pagar',
  vacant: 'Vago',
}

async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível carregar os dados.'))
  return data as T
}

async function apiSend(endpoint: string, body: Record<string, unknown>, method = 'POST') {
  const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
  return data
}

// Marca de estado à direita do cartão: cor apenas no texto e na marca (sem fundos pastel).
function StatusMark({ status }: { status: ApartmentVM['monthStatus'] }) {
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
 * Cartão de um apartamento (memoizado: com centenas de cartões carregados, escrever na
 * pesquisa ou pagar um aluguel não re-renderiza os restantes).
 */
const ApartmentCard = memo(function ApartmentCard({ apt, onOpen, onMarkPaid, paying }: {
  apt: ApartmentVM
  onOpen: (unitId: string) => void
  onMarkPaid: (unitId: string) => void
  paying: boolean
}) {
  const tenantName = apt.tenantName ?? ''
  return (
    <div className="apt-card">
      <button className="apt-card-main" type="button" data-apt-card={apt.unitId} aria-label={`Abrir ${apt.title}`} onClick={() => onOpen(apt.unitId)}>
        {tenantName
          ? <span className="apt-avatar" style={{ background: avatarColor(tenantName) }}>{initials(tenantName)}</span>
          : <span className="apt-avatar apt-avatar-vacant"><UiIcon name="key" /></span>}
        <span className="apt-card-body">
          <span className="apt-card-top">
            <span className="apt-card-titles">
              {apt.label ? <span className="apt-card-label">{apt.label}</span> : null}
              <strong className="apt-card-title">{apt.title}</strong>
            </span>
            <StatusMark status={apt.monthStatus} />
          </span>
          <span className="apt-card-tenant">{tenantName || 'Sem inquilino'}</span>
          <span className="apt-card-facts">
            {apt.leaseId ? <span className="apt-fact"><UiIcon name="euro" />{money(apt.rent)}</span> : null}
            {apt.leaseEnd ? <span className="apt-fact"><UiIcon name="calendar" />{date(apt.leaseEnd)}</span> : null}
            {apt.openTickets > 0 ? <span className="apt-fact apt-fact-alert" aria-label={`${apt.openTickets} ${apt.openTickets === 1 ? 'avaria' : 'avarias'}`}><UiIcon name="tools" />{apt.openTickets}</span> : null}
          </span>
        </span>
      </button>
      {apt.monthStatus === 'due' || apt.monthStatus === 'confirming' ? (
        <button className="apt-pay" type="button" disabled={paying} aria-busy={paying} onClick={() => onMarkPaid(apt.unitId)}>
          {paying ? 'Um momento…' : apt.monthStatus === 'confirming' ? 'Confirmar pagamento' : 'Marcar como pago'}
        </button>
      ) : null}
    </div>
  )
})

/** Formulário único para adicionar/editar apartamento (imóvel + unidade atómicos por trás). */
function ApartmentForm({ apt, onSubmit, onCancel, submitting }: {
  apt: ApartmentVM | null
  onSubmit: (form: HTMLFormElement) => void
  onCancel: () => void
  submitting: boolean
}) {
  const isEdit = !!apt
  return (
    <section className="apt-form-card">
      <form onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget) }}>
        <div className="apt-bill-grid">
          <div className="field field-full">
            <label htmlFor="apt-address">Endereço <span className="apt-req">obrigatória</span></label>
            <input id="apt-address" name="addressLine1" autoComplete="address-line1" defaultValue={apt?.addressLine1 ?? ''} placeholder="Ex.: Rua das Flores, 12, 3.º Esq." required />
          </div>
          <div className="field field-full">
            <label htmlFor="apt-name">Nome <span className="apt-optional">opcional</span></label>
            <input id="apt-name" name="name" defaultValue={apt?.label ?? ''} placeholder="Um nome à sua escolha (ex.: Casa das Flores)" />
          </div>
          <div className="field">
            <label htmlFor="apt-city">Cidade</label>
            <input id="apt-city" name="city" autoComplete="address-level2" defaultValue={apt?.city ?? ''} required />
          </div>
          <div className="field">
            <label htmlFor="apt-postal">CEP</label>
            <input id="apt-postal" name="postalCode" autoComplete="postal-code" inputMode="numeric" defaultValue={apt?.postalCode ?? ''} placeholder="0000-000" required />
          </div>
          <div className="field field-full">
            <label htmlFor="apt-rent">Aluguel mensal (R$)</label>
            <input id="apt-rent" name="monthlyRent" type="number" step="1" min="1" defaultValue={apt ? apt.rent : ''} required />
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

/** Detalhe de um apartamento: contrato, pagamentos e contas — tudo vindo limitado do servidor. */
function ApartmentDetail({ detail, busy, onMarkPaid, paying, onEdit, onAddExpense, onDeleteExpense }: {
  detail: ApartmentDetailData
  busy: string | null
  onMarkPaid: (unitId: string) => void
  paying: boolean
  onEdit: (apt: ApartmentVM) => void
  onAddExpense: (apt: ApartmentVM, form: HTMLFormElement) => void
  onDeleteExpense: (apt: ApartmentVM, id: string) => void
}) {
  const apt = detail.apartment
  const phone = apt.tenantPhone ?? ''
  const monthTitle = apt.monthStatus === 'paid'
    ? 'Aluguel recebido'
    : apt.monthStatus === 'confirming'
      ? 'Pagamento por confirmar'
      : apt.monthStatus === 'due'
        ? 'Aluguel por receber'
        : 'Apartamento vago'
  return (
    <section className="apt-detail">
      <p className="apt-detail-address">{apt.label ? `${apt.label} · ${apt.city}` : apt.city}</p>

      <div className={`apt-detail-month apt-detail-month-${apt.monthStatus}`}>
        <div>
          <span>Este mês</span>
          <strong>{monthTitle}</strong>
        </div>
        {apt.monthStatus === 'due' || apt.monthStatus === 'confirming' ? (
          <button className="apt-pay" type="button" disabled={paying} aria-busy={paying} onClick={() => onMarkPaid(apt.unitId)}>
            {paying ? 'Um momento…' : apt.monthStatus === 'confirming' ? 'Confirmar pagamento' : 'Marcar como pago'}
          </button>
        ) : apt.monthStatus === 'paid' ? <span className="apt-badge apt-badge-paid">✓ Pago</span> : null}
      </div>

      {apt.leaseId ? (
        <div className="apt-detail-card">
          <h2>Inquilino e contrato</h2>
          <dl className="apt-facts">
            <div><dt>Nome</dt><dd>{apt.tenantName ?? '—'}</dd></div>
            <div><dt>Telefone</dt><dd>{phone ? <a href={`tel:${phone}`}>{phone}</a> : '—'}</dd></div>
            <div><dt>Aluguel</dt><dd>{money(apt.rent)} por mês</dd></div>
            <div><dt>Contrato desde</dt><dd>{date(apt.leaseStart)}</dd></div>
            {apt.leaseEnd ? <div><dt>Termina</dt><dd>{date(apt.leaseEnd)}</dd></div> : null}
            <div><dt>Avarias abertas</dt><dd>{apt.openTickets > 0 ? `${apt.openTickets}` : 'Nenhuma'}</dd></div>
          </dl>
          {phone ? <a className="apt-detail-call" href={`tel:${phone}`}>Ligar ao inquilino</a> : null}
        </div>
      ) : (
        <div className="apt-detail-card apt-detail-vacant">
          <p>Este apartamento está <strong>vago</strong>. Quando encontrar um inquilino, crie o contrato para começar a receber o aluguel.</p>
          <a className="apt-detail-call" href="/leases">Criar contrato</a>
        </div>
      )}

      {apt.leaseId ? (
        <div className="apt-detail-card">
          <h2>Últimos pagamentos</h2>
          {detail.payments.length ? (
            <ul className="apt-history">
              {detail.payments.map((payment) => (
                <li key={payment.id}>
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
        {detail.expenses.length ? (
          <ul className="apt-history">
            {detail.expenses.map((expense) => (
              <li key={expense.id}>
                <span className="apt-history-date">{expense.category || 'Despesa'} · {date(expense.incurredAt)}</span>
                <strong>{money(Number(expense.amount ?? 0))}</strong>
                <button
                  className="apt-mini-delete"
                  type="button"
                  aria-label={`Apagar despesa de ${money(Number(expense.amount ?? 0))}`}
                  disabled={busy === `delete-${expense.id}`}
                  onClick={() => { if (window.confirm('Apagar esta conta?')) onDeleteExpense(apt, expense.id) }}
                >Apagar</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted">Ainda não há contas registadas neste apartamento.</p>}

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
          <button className="button button-primary" type="submit" disabled={busy === 'add-expense'}>
            {busy === 'add-expense' ? 'A registar…' : 'Adicionar conta'}
          </button>
        </form>
      </div>

      <div className="apt-detail-links">
        <button type="button" onClick={() => onEdit(apt)}>Editar apartamento</button>
        <a href="/operations">Registar uma avaria</a>
      </div>
    </section>
  )
}

const PAGE_SIZE = 24

export function HomePage() {
  const [home, setHome] = useState<HomeData | null>(null)
  const [apartments, setApartments] = useState<ApartmentVM[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [payingUnitId, setPayingUnitId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [openDetail, setOpenDetail] = useState<ApartmentDetailData | null>(null)
  const [addingApartment, setAddingApartment] = useState(false)
  const [editingApartment, setEditingApartment] = useState<ApartmentVM | null>(null)
  const [isDemoUser, setIsDemoUser] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const prevViewRef = useRef<string>('list')
  const queryRef = useRef('')
  // Nº de sequência dos pedidos de lista: respostas fora de ordem (pesquisa rápida + Ver mais)
  // são descartadas em vez de sobrescreverem resultados mais recentes.
  const listSeqRef = useRef(0)
  const firstSearchRef = useRef(true)
  // Espelhos em ref para os callbacks memoizados (mantém os cartões React.memo estáveis).
  const payingRef = useRef<string | null>(null)
  const openDetailIdRef = useRef<string | null>(null)

  const loadHome = useCallback(async () => {
    try {
      setHome(await apiGet<HomeData>('/api/home'))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar o resumo.' })
    }
  }, [])

  const loadApartments = useCallback(async (options: { q?: string; cursor?: string | null; append?: boolean } = {}) => {
    const q = options.q ?? queryRef.current
    const params = new URLSearchParams({ take: String(PAGE_SIZE) })
    if (q) params.set('q', q)
    if (options.cursor) params.set('cursor', options.cursor)
    const seq = ++listSeqRef.current
    try {
      const page = await apiGet<Paged<ApartmentVM>>(`/api/apartments?${params.toString()}`)
      if (seq !== listSeqRef.current) return // resposta obsoleta (chegou outra entretanto)
      setApartments((current) => (options.append ? [...current, ...page.items] : page.items))
      setNextCursor(page.nextCursor)
      setTotal(page.total)
    } catch (error) {
      if (seq !== listSeqRef.current) return
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar os apartamentos.' })
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([loadHome(), loadApartments()]).finally(() => { if (active) setLoading(false) })
    fetch('/api/auth/session')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (active && data?.user?.email === 'adilson@teste.com') setIsDemoUser(true) })
      .catch(() => {})
    return () => { active = false }
  }, [loadHome, loadApartments])

  // Pesquisa server-side com debounce: nunca filtramos coleções no browser.
  useEffect(() => {
    queryRef.current = query.trim()
    if (firstSearchRef.current) {
      firstSearchRef.current = false
      return // o carregamento inicial já foi feito no mount
    }
    const timer = setTimeout(() => { void loadApartments({ q: queryRef.current }) }, 300)
    return () => clearTimeout(timer)
  }, [query, loadApartments])

  // Gestão de foco entre lista / detalhe / adicionar / editar.
  const focusViewKey = addingApartment
    ? 'add'
    : editingApartment
      ? `edit:${editingApartment.unitId}`
      : openDetail
        ? `detail:${openDetail.apartment.unitId}`
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

  // Espelha o detalhe aberto num ref, para o markPaid memoizado não depender do estado.
  useEffect(() => {
    openDetailIdRef.current = openDetail?.apartment.unitId ?? null
  }, [openDetail])

  const openApartment = useCallback(async (unitId: string) => {
    try {
      setOpenDetail(await apiGet<ApartmentDetailData>(`/api/apartments/${unitId}`))
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível abrir o apartamento.' })
    }
  }, [])

  const refreshDetail = useCallback(async (unitId: string) => {
    try {
      setOpenDetail(await apiGet<ApartmentDetailData>(`/api/apartments/${unitId}`))
    } catch {
      // mantém o detalhe anterior; o aviso de erro já foi mostrado pela ação
    }
  }, [])

  const markPaid = useCallback(async (unitId: string) => {
    if (payingRef.current) return
    payingRef.current = unitId
    setPayingUnitId(unitId)
    try {
      const result = await apiSend(`/api/apartments/${unitId}/mark-paid`, {})
      const paid = result?.monthStatus === 'paid'
      // Mensagem honesta: um pagamento parcial confirmado NÃO é "aluguel pago".
      setNotice({
        kind: 'success',
        text: result?.already
          ? 'Este aluguel já estava marcado como pago.'
          : paid
            ? 'Aluguel marcado como pago.'
            : 'Pagamento parcial confirmado — ainda falta receber parte deste aluguel.',
      })
      setApartments((current) => current.map((apt) => (apt.unitId === unitId ? { ...apt, monthStatus: paid ? 'paid' : 'due' } : apt)))
      if (openDetailIdRef.current === unitId) await refreshDetail(unitId)
      await loadHome() // agregado leve; substitui o antigo reload de 9 coleções
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar como pago.' })
    } finally {
      payingRef.current = null
      setPayingUnitId(null)
    }
  }, [refreshDetail, loadHome])

  async function addApartment(form: HTMLFormElement) {
    if (busy) return
    const data = payload(form)
    setBusy('save-apartment')
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
      await Promise.all([loadApartments(), loadHome()])
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível adicionar o apartamento.' })
    } finally {
      setBusy(null)
    }
  }

  async function updateApartment(apt: ApartmentVM, form: HTMLFormElement) {
    if (busy) return
    const data = payload(form)
    setBusy('save-apartment')
    try {
      await apiSend('/api/apartments', {
        propertyId: apt.propertyId,
        unitId: apt.unitId,
        name: data.name,
        addressLine1: data.addressLine1,
        city: data.city,
        postalCode: data.postalCode,
        monthlyRent: Number(data.monthlyRent),
      }, 'PATCH')
      setNotice({ kind: 'success', text: 'Apartamento atualizado.' })
      setEditingApartment(null)
      await loadApartments()
      if (openDetail?.apartment.unitId === apt.unitId) await refreshDetail(apt.unitId)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível guardar as alterações.' })
    } finally {
      setBusy(null)
    }
  }

  async function addExpense(apt: ApartmentVM, form: HTMLFormElement) {
    if (busy) return
    const data = payload(form)
    setBusy('add-expense')
    try {
      await apiSend('/api/expenses', { ...data, propertyId: apt.propertyId })
      setNotice({ kind: 'success', text: 'Conta registada.' })
      form.reset()
      await refreshDetail(apt.unitId)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar a conta.' })
    } finally {
      setBusy(null)
    }
  }

  async function deleteExpense(apt: ApartmentVM, expenseId: string) {
    if (busy) return
    setBusy(`delete-${expenseId}`)
    try {
      await apiSend(`/api/expenses/${expenseId}`, {}, 'DELETE')
      setNotice({ kind: 'success', text: 'Conta apagada.' })
      await refreshDetail(apt.unitId)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível apagar a conta.' })
    } finally {
      setBusy(null)
    }
  }

  async function loadDemoData() {
    if (busy) return
    if (!window.confirm('Isto carrega 2 apartamentos de exemplo (substitui o que existir nesta conta demo). Continuar?')) return
    setBusy('demo')
    try {
      await apiSend('/api/demo/seed', {})
      setNotice({ kind: 'success', text: 'Dados de demonstração carregados.' })
      await Promise.all([loadApartments(), loadHome()])
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível carregar a demonstração.' })
    } finally {
      setBusy(null)
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await loadApartments({ cursor: nextCursor, append: true })
    } finally {
      setLoadingMore(false)
    }
  }

  const tasks = home?.tasks
  const month = home?.month
  const attentionCount = tasks
    ? tasks.dueTotal + tasks.confirmingTotal + tasks.endingSoonTotal + tasks.openTickets
    : 0
  const extraDue = tasks ? Math.max(0, tasks.dueTotal - tasks.due.length) : 0

  return (
    <main className="app-shell" id="conteudo-principal" tabIndex={-1}>
      <div className="notice-region">
        <div role="status" aria-live="polite" aria-atomic="true">
          {notice?.kind === 'success' ? <div className="notice notice-success">{notice.text}</div> : null}
        </div>
        <div role="alert" aria-live="assertive" aria-atomic="true">
          {notice?.kind === 'error' ? <div className="notice notice-error">{notice.text}</div> : null}
        </div>
      </div>

      <header className="mobile-dashboard-header">
        <div>
          {addingApartment || editingApartment || openDetail
            ? <button className="apt-back" type="button" onClick={() => {
                if (addingApartment) setAddingApartment(false)
                else if (editingApartment) setEditingApartment(null)
                else setOpenDetail(null)
              }}>{editingApartment ? '‹ Voltar' : '‹ Os meus apartamentos'}</button>
            : <p className="screen-kicker">A sua gestão, simples e clara</p>}
          <h1 ref={headingRef} tabIndex={-1}>
            {addingApartment ? 'Adicionar apartamento' : editingApartment ? 'Editar apartamento' : openDetail ? openDetail.apartment.title : 'Os meus apartamentos'}
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

      {loading ? (
        <p className="muted" style={{ padding: '8px 2px' }}>A carregar os seus apartamentos…</p>
      ) : addingApartment ? (
        <ApartmentForm apt={null} onSubmit={addApartment} onCancel={() => setAddingApartment(false)} submitting={busy === 'save-apartment'} />
      ) : editingApartment ? (
        <ApartmentForm apt={editingApartment} onSubmit={(form) => { if (editingApartment) updateApartment(editingApartment, form) }} onCancel={() => setEditingApartment(null)} submitting={busy === 'save-apartment'} />
      ) : openDetail ? (
        <ApartmentDetail
          detail={openDetail}
          busy={busy}
          onMarkPaid={markPaid}
          paying={payingUnitId === openDetail.apartment.unitId}
          onEdit={(apt) => setEditingApartment(apt)}
          onAddExpense={addExpense}
          onDeleteExpense={deleteExpense}
        />
      ) : total === 0 && !queryRef.current ? (
        <div className="apt-empty-home">
          <span className="apt-empty-avatar"><UiIcon name="building" /></span>
          <h2>Ainda não tem apartamentos</h2>
          <p>Adicione o seu primeiro apartamento para começar a acompanhar aluguéis e contas.</p>
          <button className="button button-primary" type="button" onClick={() => setAddingApartment(true)}>Adicionar apartamento</button>
          {isDemoUser ? (
            <button className="apt-demo-link" type="button" disabled={busy === 'demo'} onClick={loadDemoData}>
              {busy === 'demo' ? 'A carregar…' : 'Carregar dados de demonstração'}
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <section className="assist" aria-label="O que precisa da sua atenção">
            {attentionCount === 0 ? (
              <div className="assist-ok">
                <span className="assist-ok-ic"><UiIcon name="check" /></span>
                <div>
                  <strong>Está tudo em dia</strong>
                  <span>Não há nada pendente hoje.</span>
                </div>
              </div>
            ) : (
              <>
                <p className="assist-title">O que fazer hoje</p>
                <div className="assist-tasks">
                  {tasks?.due.map((task) => (
                    <div className="assist-task" key={`due-${task.unitId}`}>
                      <span className="assist-task-ic assist-ic-due"><UiIcon name="alert" /></span>
                      <span className="assist-task-txt">
                        <strong>{money(task.rent)}</strong>
                        <span>{task.tenantName ?? 'Inquilino'}</span>
                      </span>
                      <button className="assist-task-btn" type="button" disabled={payingUnitId === task.unitId} aria-busy={payingUnitId === task.unitId} onClick={() => markPaid(task.unitId)}>
                        {payingUnitId === task.unitId ? '…' : 'Marcar como pago'}
                      </button>
                    </div>
                  ))}
                  {extraDue > 0 ? (
                    <p className="assist-more">… e mais {extraDue} {extraDue === 1 ? 'aluguel por receber' : 'aluguéis por receber'}</p>
                  ) : null}
                  {tasks?.confirming.map((task) => (
                    <div className="assist-task" key={`conf-${task.unitId}`}>
                      <span className="assist-task-ic assist-ic-info"><UiIcon name="clock" /></span>
                      <span className="assist-task-txt">
                        <strong>{money(task.rent)}</strong>
                        <span>{task.tenantName ?? 'Inquilino'} — confirmar</span>
                      </span>
                      <button className="assist-task-btn" type="button" disabled={payingUnitId === task.unitId} aria-busy={payingUnitId === task.unitId} onClick={() => markPaid(task.unitId)}>
                        {payingUnitId === task.unitId ? '…' : 'Confirmar'}
                      </button>
                    </div>
                  ))}
                  {tasks?.endingSoon.map((task) => (
                    <button className="assist-task assist-task-link" type="button" key={`end-${task.unitId}`} onClick={() => openApartment(task.unitId)}>
                      <span className="assist-task-ic assist-ic-info"><UiIcon name="calendar" /></span>
                      <span className="assist-task-txt">
                        <strong>Contrato {task.days === 0 ? 'termina hoje' : `termina em ${task.days} ${task.days === 1 ? 'dia' : 'dias'}`}</strong>
                        <span>{task.tenantName ?? ''} · {task.title}</span>
                      </span>
                      <span className="assist-task-arrow"><UiIcon name="arrow" /></span>
                    </button>
                  ))}
                  {tasks && tasks.openTickets > 0 ? (
                    <a className="assist-task assist-task-link" href="/operations">
                      <span className="assist-task-ic assist-ic-warn"><UiIcon name="tools" /></span>
                      <span className="assist-task-txt">
                        <strong>{tasks.openTickets} {tasks.openTickets === 1 ? 'avaria pendente' : 'avarias pendentes'}</strong>
                        <span>Ver manutenção</span>
                      </span>
                      <span className="assist-task-arrow"><UiIcon name="arrow" /></span>
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </section>

          {month ? (
            <section className="apt-hero" aria-label="Resumo deste mês">
              <p className="apt-hero-kicker"><UiIcon name="calendar" />Este mês</p>
              <p className="apt-hero-amount">
                <strong>{money(month.received)}</strong>
                <span>de {money(month.expected)}</span>
              </p>
              <div className="apt-progress" role="img" aria-label={`Recebido ${money(month.received)} de ${money(month.expected)} previstos`}>
                <span className="apt-progress-fill" style={{ width: `${month.expected > 0 ? Math.min(100, Math.round((month.received / month.expected) * 100)) : 0}%` }} />
              </div>
              <div className="apt-hero-chips">
                <span className="apt-hero-chip apt-hero-chip-paid"><UiIcon name="check" />{month.paidCount} {month.paidCount === 1 ? 'pago' : 'pagos'}</span>
                <span className="apt-hero-chip apt-hero-chip-due"><UiIcon name="clock" />{month.dueCount} por pagar</span>
                {month.confirmingCount > 0 ? <span className="apt-hero-chip apt-hero-chip-confirm"><UiIcon name="clock" />{month.confirmingCount} a confirmar</span> : null}
              </div>
            </section>
          ) : null}

          {home ? (
            <div className="apt-stats" role="group" aria-label="Resumo do portfólio">
              <div className="apt-stat" role="img" aria-label={`${home.stats.apartments} ${home.stats.apartments === 1 ? 'apartamento' : 'apartamentos'}`}>
                <span className="apt-stat-ic"><UiIcon name="building" /></span>
                <strong aria-hidden="true">{home.stats.apartments}</strong>
              </div>
              <div className={`apt-stat ${home.stats.dueCount > 0 ? 'apt-stat-warn' : ''}`} role="img" aria-label={`${home.stats.dueCount} em atraso`}>
                <span className="apt-stat-ic"><UiIcon name="alert" /></span>
                <strong aria-hidden="true">{home.stats.dueCount}</strong>
              </div>
              <div className={`apt-stat ${home.stats.openTickets > 0 ? 'apt-stat-warn' : ''}`} role="img" aria-label={`${home.stats.openTickets} ${home.stats.openTickets === 1 ? 'avaria' : 'avarias'}`}>
                <span className="apt-stat-ic"><UiIcon name="tools" /></span>
                <strong aria-hidden="true">{home.stats.openTickets}</strong>
              </div>
            </div>
          ) : null}

          <div className="apt-search">
            <span className="apt-search-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Procurar apartamento ou inquilino…"
              aria-label="Procurar apartamento"
            />
            <p className="sr-only" role="status" aria-live="polite">
              {query ? `${total} ${total === 1 ? 'apartamento encontrado' : 'apartamentos encontrados'}` : ''}
            </p>
          </div>

          <section className="apt-list" aria-label="Os meus apartamentos">
            {apartments.length ? apartments.map((apt) => (
              <ApartmentCard
                key={apt.unitId}
                apt={apt}
                onOpen={openApartment}
                onMarkPaid={markPaid}
                paying={payingUnitId === apt.unitId}
              />
            )) : <p className="muted">Nenhum apartamento corresponde à pesquisa.</p>}
          </section>

          {nextCursor ? (
            <button className="apt-load-more" type="button" disabled={loadingMore} aria-busy={loadingMore} onClick={loadMore}>
              {loadingMore ? 'A carregar…' : `Ver mais (${apartments.length} de ${total})`}
            </button>
          ) : null}

          <button className="apt-add" type="button" onClick={() => setAddingApartment(true)}>+ Adicionar apartamento</button>
        </>
      )}

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
