'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  EXPENSE_CATEGORIES,
  EXPENSE_ICON,
  type Notice,
  type Paged,
  type Row,
  UiIcon,
  apiErrorMessage,
  money,
  todayISO,
} from '@/app/components/shared'

type PropRow = { id: string; title: string }

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível carregar os dados.'))
  return data as T
}

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(apiErrorMessage(data, 'Não foi possível concluir o pedido.'))
  return data
}

const PAGE = 50

/**
 * "Lançar contas" — fluxo em 2 passos para lançar a MESMA despesa em vários apartamentos
 * (ex.: as contas de luz do mês):
 *   1) grelha de botões com ícone (um por tipo de conta);
 *   2) lista corrida: um apartamento por linha, só o valor à frente. Digitar → ✓ verde.
 *      Linhas em branco não são lançadas. Total corrido no rodapé. "Preencher com o último
 *      valor" usa o que foi lançado da última vez (memória do assistente). Guardar = 1 lote.
 */
export function BatchExpenses({ onClose, onSaved, setNotice }: {
  onClose: () => void
  onSaved: (message: string) => void
  setNotice: (notice: Notice) => void
}) {
  const [category, setCategory] = useState<string | null>(null)
  const [incurredAt, setIncurredAt] = useState(todayISO())
  const [rows, setRows] = useState<PropRow[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [lastMap, setLastMap] = useState<Record<string, number>>({})
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const didFocusRef = useRef(false) // foca a 1.ª linha só quando a 1.ª página chega (não a cada "Ver mais")
  const idemKeyRef = useRef<string | null>(null) // estável por lote → retries/duplo-clique não duplicam

  const loadRows = useCallback(async (cursor?: string | null, append = false) => {
    const params = new URLSearchParams({ take: String(PAGE) })
    if (cursor) params.set('cursor', cursor)
    const page = await getJson<Paged<Row>>(`/api/properties?${params.toString()}`)
    const mapped = page.items.map((p) => ({ id: p.id as string, title: (p.addressLine1 as string) || (p.name as string) || 'Imóvel' }))
    setRows((current) => (append ? [...current, ...mapped] : mapped))
    setNextCursor(page.nextCursor)
    setTotal(page.total)
  }, [])

  async function pickCategory(cat: string) {
    setCategory(cat)
    setValues({})
    didFocusRef.current = false
    idemKeyRef.current = crypto.randomUUID()
    setLoading(true)
    try {
      const [, last] = await Promise.all([
        loadRows(),
        getJson<{ map: Record<string, number> }>(`/api/expenses/last?category=${encodeURIComponent(cat)}`),
      ])
      setLastMap(last.map)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar os apartamentos.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (category && !loading && rows.length && !didFocusRef.current) {
      firstInputRef.current?.focus()
      didFocusRef.current = true
    }
  }, [category, loading, rows.length])

  const filled = Object.entries(values).filter(([, v]) => Number(v) > 0)
  const filledCount = filled.length
  const filledTotal = filled.reduce((sum, [, v]) => sum + Number(v), 0)
  const hasGhosts = Object.keys(lastMap).length > 0

  function fillFromLast() {
    // Preenche a partir do lastMap INTEIRO — inclui imóveis ainda não paginados (o save
    // envia todos os `values`, e ao fazer "Ver mais" essas linhas já aparecem preenchidas).
    setValues((current) => {
      const next = { ...current }
      for (const [id, amount] of Object.entries(lastMap)) {
        if (!next[id]) next[id] = String(amount)
      }
      return next
    })
  }

  async function save() {
    const items = filled.map(([propertyId, v]) => ({ propertyId, amount: Number(v) }))
    if (!items.length) {
      setNotice({ kind: 'error', text: 'Preencha o valor de pelo menos um apartamento.' })
      return
    }
    setSaving(true)
    try {
      const result = await postJson('/api/expenses/batch', { category, incurredAt, idempotencyKey: idemKeyRef.current, items })
      const n = Number(result?.created ?? items.length)
      onSaved(`${n} ${n === 1 ? 'conta lançada' : 'contas lançadas'} de ${(category ?? '').toLowerCase()}.`)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível lançar as contas.' })
    } finally {
      setSaving(false)
    }
  }

  function goBack() {
    if (filledCount > 0 && !window.confirm('Tem valores por guardar que serão descartados. Continuar?')) return
    setCategory(null)
  }

  return (
    <section className="section batch">
      <header className="mobile-dashboard-header">
        <div>
          <button className="apt-back" type="button" onClick={category ? goBack : onClose}>
            ‹ {category ? 'Escolher tipo' : 'Finanças'}
          </button>
          <h1>{category ?? 'Lançar contas'}</h1>
        </div>
      </header>

      {!category ? (
        <>
          <p className="batch-hint">Que conta chegou? Escolha o tipo e lance de uma vez em todos os apartamentos.</p>
          <div className="batch-grid">
            {EXPENSE_CATEGORIES.map((cat) => {
              const meta = EXPENSE_ICON[cat] ?? { icon: 'plus' as const, color: '#64748b' }
              return (
                <button key={cat} className="batch-cat" type="button" onClick={() => pickCategory(cat)}>
                  <span className="batch-cat-ic" style={{ color: meta.color }}><UiIcon name={meta.icon} /></span>
                  <span className="batch-cat-name">{cat}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="batch-bar">
            <label className="batch-date">
              <span>Data</span>
              <input type="date" value={incurredAt} onChange={(event) => setIncurredAt(event.target.value)} />
            </label>
            {hasGhosts ? (
              <button className="batch-fill" type="button" onClick={fillFromLast}>
                <UiIcon name="clock" />Preencher com o último valor
              </button>
            ) : null}
          </div>

          {loading ? (
            <p className="muted" style={{ padding: '8px 2px' }}>A carregar apartamentos…</p>
          ) : (
            <>
              <ul className="batch-list">
                {rows.map((row, index) => {
                  const value = values[row.id] ?? ''
                  const isFilled = Number(value) > 0
                  const ghost = lastMap[row.id]
                  return (
                    <li key={row.id} className={`batch-row ${isFilled ? 'batch-row-filled' : ''}`}>
                      <span className="batch-row-name">{row.title}</span>
                      <span className="batch-row-input">
                        <span className="batch-currency">R$</span>
                        <input
                          ref={index === 0 ? firstInputRef : undefined}
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={value}
                          placeholder={ghost !== undefined ? String(ghost) : '0'}
                          aria-label={`Valor para ${row.title}`}
                          onChange={(event) => setValues((current) => ({ ...current, [row.id]: event.target.value }))}
                        />
                        {isFilled ? (
                          <span className="batch-check" aria-hidden="true"><UiIcon name="check" /></span>
                        ) : ghost !== undefined ? (
                          <button className="batch-ghost" type="button" aria-label={`Usar ${money(ghost)} do último lançamento`} onClick={() => setValues((current) => ({ ...current, [row.id]: String(ghost) }))}>
                            usar {money(ghost)}
                          </button>
                        ) : null}
                      </span>
                    </li>
                  )
                })}
              </ul>
              {nextCursor ? (
                <button
                  className="apt-load-more"
                  type="button"
                  disabled={loadingMore}
                  aria-busy={loadingMore}
                  onClick={() => { setLoadingMore(true); void loadRows(nextCursor, true).finally(() => setLoadingMore(false)) }}
                >
                  {loadingMore ? 'A carregar…' : `Ver mais (${rows.length} de ${total})`}
                </button>
              ) : null}
            </>
          )}

          <div className="batch-footer">
            <span className="batch-total">
              <strong>{filledCount}</strong> {filledCount === 1 ? 'conta' : 'contas'} · <strong>{money(filledTotal)}</strong>
            </span>
            <button className="button button-primary batch-save" type="button" disabled={saving || filledCount === 0} onClick={save}>
              {saving ? 'A guardar…' : `Guardar ${filledCount || ''}`.trim()}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
