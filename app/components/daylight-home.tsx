'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApartmentVM } from '@/lib/apartments'
import { apiErrorMessage, money, type Notice, type Paged } from '@/app/components/shared'

/**
 * Home "posto de comando" (direção Daylight), desenhada para escala real (dezenas de imóveis):
 * gestão por exceção — primeiro o pulso do mês em contagem, depois SÓ o que precisa de ação hoje
 * ("Para resolver"), e por fim a lista densa de todos os imóveis com busca e filtros por estado.
 *
 * Reaproveita os agregados que já existem no servidor:
 * - /api/home devolve o pulso (contagens) + as tarefas top-5 (por receber / a confirmar);
 * - /api/apartments devolve páginas de view-models (busca server-side, "Ver mais" por cursor);
 * - marcar como pago é UM pedido atómico que atualiza só o cartão afetado + recarrega o pulso.
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

type StatusFilter = 'all' | 'paid' | 'due' | 'confirming' | 'vacant'

const STATUS_TAG: Record<ApartmentVM['monthStatus'], string> = {
  paid: 'Pago',
  confirming: 'Conferir',
  due: 'Devendo',
  vacant: 'Vazio',
}

const PAGE_SIZE = 30

async function apiGet<T>(endpoint: string): Promise<T> {
  const response = await fetch(endpoint)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível carregar os dados.'))
  return data as T
}

async function apiSend(endpoint: string, body: Record<string, unknown>, method = 'POST') {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
  return data
}

export function DaylightHome() {
  const [home, setHome] = useState<HomeData | null>(null)
  const [apartments, setApartments] = useState<ApartmentVM[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [payingUnitId, setPayingUnitId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const queryRef = useRef('')
  const firstSearchRef = useRef(true)
  // Sequência dos pedidos de lista: respostas fora de ordem (busca rápida + Ver mais) são descartadas.
  const listSeqRef = useRef(0)

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
      if (seq !== listSeqRef.current) return
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
    Promise.all([loadHome(), loadApartments()]).finally(() => {
      if (active) setLoading(false)
    })
    return () => {
      active = false
    }
  }, [loadHome, loadApartments])

  // Busca server-side com debounce: nunca filtramos coleções no browser.
  useEffect(() => {
    queryRef.current = query.trim()
    if (firstSearchRef.current) {
      firstSearchRef.current = false
      return
    }
    const timer = setTimeout(() => void loadApartments({ q: queryRef.current }), 300)
    return () => clearTimeout(timer)
  }, [query, loadApartments])

  const markPaid = useCallback(
    async (unitId: string) => {
      if (payingUnitId) return
      setPayingUnitId(unitId)
      try {
        const result = await apiSend(`/api/apartments/${unitId}/mark-paid`, {})
        const paid = result?.monthStatus === 'paid'
        setNotice({
          kind: 'success',
          text: result?.already
            ? 'Este aluguel já estava marcado como pago.'
            : paid
              ? 'Aluguel marcado como pago.'
              : 'Pagamento parcial confirmado — ainda falta receber parte deste aluguel.',
        })
        setApartments((current) =>
          current.map((apt) => (apt.unitId === unitId ? { ...apt, monthStatus: paid ? 'paid' : 'due' } : apt)),
        )
        await loadHome()
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar como pago.' })
      } finally {
        setPayingUnitId(null)
      }
    },
    [payingUnitId, loadHome],
  )

  async function loadMore() {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      await loadApartments({ cursor: nextCursor, append: true })
    } finally {
      setLoadingMore(false)
    }
  }

  const month = home?.month
  const stats = home?.stats
  const paidCount = month?.paidCount ?? 0
  const dueCount = month?.dueCount ?? 0
  const confirmingCount = month?.confirmingCount ?? 0
  const totalUnits = stats?.apartments ?? 0
  const vacantCount = Math.max(0, totalUnits - paidCount - dueCount - confirmingCount)
  const pending = dueCount + confirmingCount
  const pct = (n: number) => (totalUnits > 0 ? `${(n / totalUnits) * 100}%` : '0%')

  const tasks = home?.tasks
  const solveTasks = [
    ...(tasks?.due ?? []).map((t) => ({ ...t, kind: 'due' as const })),
    ...(tasks?.confirming ?? []).map((t) => ({ ...t, kind: 'confirming' as const })),
  ]

  // Filtro por estado: aplicado sobre os imóveis já carregados (a busca continua server-side).
  const visibleApartments = filter === 'all' ? apartments : apartments.filter((a) => a.monthStatus === filter)

  const chips: Array<{ key: StatusFilter; label: string; count: number; dot?: string }> = [
    { key: 'all', label: 'Todos', count: totalUnits },
    { key: 'due', label: 'Devendo', count: dueCount, dot: 'var(--dl-ember)' },
    { key: 'confirming', label: 'Conferir', count: confirmingCount, dot: 'var(--dl-topaz)' },
    { key: 'paid', label: 'Pagos', count: paidCount, dot: 'var(--dl-mint)' },
    { key: 'vacant', label: 'Vazios', count: vacantCount, dot: 'var(--dl-slate)' },
  ]

  return (
    <main className="dl-shell" id="conteudo-principal" tabIndex={-1}>
      <div className="dl-notice-region">
        <div role="status" aria-live="polite" aria-atomic="true">
          {notice?.kind === 'success' ? <div className="dl-notice dl-notice-success">{notice.text}</div> : null}
        </div>
        <div role="alert" aria-live="assertive" aria-atomic="true">
          {notice?.kind === 'error' ? <div className="dl-notice dl-notice-error">{notice.text}</div> : null}
        </div>
      </div>

      <header className="dl-head">
        <div>
          <h1>Meus apartamentos</h1>
          <div className="dl-sub">{totalUnits} {totalUnits === 1 ? 'unidade' : 'unidades'}</div>
        </div>
        <button
          className="dl-signout"
          type="button"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST' })
            window.location.href = '/login'
          }}
        >
          Sair
        </button>
      </header>

      {loading ? (
        <p className="dl-loading">A carregar os seus apartamentos…</p>
      ) : total === 0 && !queryRef.current ? (
        <div className="dl-empty">
          <h2>Ainda não tem apartamentos</h2>
          <p>Adicione o seu primeiro apartamento para começar a acompanhar aluguéis e contas.</p>
          <a className="dl-recv" href="/portfolio">
            Adicionar apartamento
          </a>
        </div>
      ) : (
        <>
          {home ? (
            <section className="dl-pulse" aria-label="Situação do mês">
              <div className="dl-pline">
                <span className="dl-pitem mint">
                  <b>{paidCount}</b> pagos
                </span>
                <span className="dl-pitem ember">
                  <b>{pending}</b> por pagar
                </span>
                <span className="dl-pitem slate">
                  <b>{vacantCount}</b> vazios
                </span>
              </div>
              <div className="dl-ptrack" role="img" aria-label={`${paidCount} pagos, ${pending} por pagar, ${vacantCount} vazios`}>
                {paidCount > 0 ? <i className="dl-seg-mint" style={{ width: pct(paidCount) }} /> : null}
                {pending > 0 ? <i className="dl-seg-ember" style={{ width: pct(pending) }} /> : null}
                {vacantCount > 0 ? <i className="dl-seg-slate" style={{ width: pct(vacantCount) }} /> : null}
              </div>
            </section>
          ) : null}

          {solveTasks.length > 0 ? (
            <>
              <div className="dl-sec">
                <h2>Para resolver</h2>
                <span className="dl-n">· {pending}</span>
              </div>
              <div className="dl-solve">
                {solveTasks.map((task) => (
                  <div className={`dl-scard is-${task.kind}`} key={`${task.kind}-${task.unitId}`}>
                    <span className={`dl-dot is-${task.kind}`} />
                    <span className="dl-who">
                      <b>{task.title}</b>
                      <span>
                        {task.tenantName ?? 'Inquilino'} · {money(task.rent)}
                      </span>
                    </span>
                    <button
                      className="dl-recv"
                      type="button"
                      disabled={payingUnitId === task.unitId}
                      onClick={() => markPaid(task.unitId)}
                    >
                      {payingUnitId === task.unitId ? '…' : task.kind === 'confirming' ? 'Confirmar' : 'Recebi'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="dl-sec">
            <h2>Todos os imóveis</h2>
          </div>

          <div className="dl-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.2-3.2" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar apartamento ou inquilino…"
              aria-label="Buscar apartamento"
            />
          </div>

          <div className="dl-chips" role="group" aria-label="Filtrar por situação">
            {chips.map((chip) => (
              <button
                key={chip.key}
                className="dl-chip"
                type="button"
                aria-pressed={filter === chip.key}
                onClick={() => setFilter(chip.key)}
              >
                {chip.dot ? <span className="dl-cdot" style={{ background: chip.dot }} /> : null}
                <b>{chip.count}</b> {chip.label}
              </button>
            ))}
          </div>

          <div className="dl-roster">
            {visibleApartments.length ? (
              visibleApartments.map((apt) => (
                <div className={`dl-rrow is-${apt.monthStatus}`} key={apt.unitId}>
                  <span className={`dl-dot is-${apt.monthStatus}`} />
                  <span className="dl-who">
                    <b>{apt.title}</b>
                    <span>{apt.tenantName ?? 'Sem inquilino'}</span>
                  </span>
                  <span className="dl-amt">{apt.leaseId ? money(apt.rent) : '—'}</span>
                  <span className={`dl-tag is-${apt.monthStatus}`}>{STATUS_TAG[apt.monthStatus]}</span>
                </div>
              ))
            ) : (
              <p className="dl-empty-list">
                {filter === 'all' ? 'Nenhum apartamento corresponde à busca.' : 'Nenhum imóvel neste estado na lista carregada.'}
              </p>
            )}
            {nextCursor && filter === 'all' ? (
              <button className="dl-more" type="button" disabled={loadingMore} onClick={loadMore}>
                {loadingMore ? 'A carregar…' : `Ver mais (${apartments.length} de ${total})`}
              </button>
            ) : null}
          </div>

          <a className="dl-add" href="/portfolio">
            + Adicionar apartamento
          </a>
        </>
      )}
    </main>
  )
}
