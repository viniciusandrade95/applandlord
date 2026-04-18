'use client'

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { LeaseWizard } from '@/app/components/lease-wizard'

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
  if (['paid', 'occupied', 'active', 'resolved'].includes(normalized)) return 'chip chip-positive'
  if (['pending', 'partial', 'awaitingconfirmation', 'vacant', 'open', 'normal'].includes(normalized)) return 'chip chip-warning'
  if (['overdue', 'ended', 'urgent', 'cancelled'].includes(normalized)) return 'chip chip-danger'
  return 'chip chip-accent'
}


function kpiValue(value: number, format: 'count' | 'currency' | 'percent') {
  if (format === 'currency') return money(value)
  if (format === 'percent') return `${Math.round(value)}%`
  return `${Math.round(value)}`
}

function toneClass(tone: 'critical' | 'warning' | 'healthy' | 'info') {
  if (tone === 'critical') return 'state-critical'
  if (tone === 'warning') return 'state-warning'
  if (tone === 'healthy') return 'state-healthy'
  return 'state-info'
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
        <h3>{title}</h3>
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

export default function Home() {
  const [state, setState] = useState<State>(initialState)
  const [notice, setNotice] = useState<Notice>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const endpoints = ['/api/dashboard', '/api/properties', '/api/units', '/api/renters', '/api/leases', '/api/invoices', '/api/payments', '/api/maintenance']
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

  async function postJson(endpoint: string, body: Record<string, unknown>, message: string) {
    if (submitting) return

    setSubmitting(endpoint)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
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
  const activeLeaseCount = useMemo(() => state.leases.filter((lease) => lease.status === 'Active').length, [state.leases])

  return (
    <main className="app-shell">
      <section className="section" style={{ paddingBottom: 0 }}>
        <div className="section-header">
          <div>
            <h2 className="section-title">Sessão</h2>
            <p>Conta autenticada ativa.</p>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
          >
            Logout
          </button>
        </div>
      </section>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="eyebrow">Applandlord MVP</span>
            <h1>Imóveis, contratos e cobranças num só painel.</h1>
            <p className="hero-copy">
              Organize o dia da sua operação de arrendamento num único fluxo: cadastrar imóveis, ocupar unidades, emitir cobranças e confirmar pagamentos.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#cadastros">Começar cadastro base</a>
              <a className="inline-link" href="#financeiro">Já tenho base pronta, quero ir ao financeiro</a>
            </div>
            <div className="summary-grid">
              <article className="summary-card"><div className="label">Imóveis</div><div className="value">{counts?.properties ?? 0}</div><div className="hint">Portfólio ativo</div></article>
              <article className="summary-card"><div className="label">Unidades</div><div className="value">{counts?.units ?? 0}</div><div className="hint">{counts ? `${counts.occupiedUnits} ocupadas` : 'Estrutura operacional'}</div></article>
              <article className="summary-card"><div className="label">A receber</div><div className="value">{finances ? money(finances.openInvoices) : '€0'}</div><div className="hint">Saldo aberto</div></article>
              <article className="summary-card"><div className="label">Receita confirmada</div><div className="value">{finances ? money(finances.monthlyConfirmedPayments) : '€0'}</div><div className="hint">Pagamentos confirmados</div></article>
            </div>
          </div>
          <aside className="status-panel">
            <h2>Resumo do senhorio</h2>
            <p>Veja rapidamente o que precisa de decisão hoje: contratos ativos, cobranças em atraso e lucro líquido do mês.</p>
            <div className="pills">
              <span className="pill pill-soft">Base operacional</span>
              <span className="pill pill-positive">Cobranças ativas</span>
              <span className="pill pill-warning">Manutenção em curso</span>
            </div>
            <div className="stack-sm">
              <div className="pill pill-soft">Contratos ativos: {counts?.activeLeases ?? 0}</div>
              <div className="pill pill-soft">Cobranças em atraso: {counts?.overdueInvoices ?? 0}</div>
              <div className="pill pill-soft">Taxa de recebimento: {finances?.collectionRate ?? 0}%</div>
              <div className="pill pill-soft">Aguardando confirmação: {finances?.awaitingConfirmation ?? 0}</div>
              <div className="pill pill-soft">Lucro líquido mensal: {finances ? money(finances.monthlyNetProfit) : '€0'}</div>
            </div>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="attention-shell">
          <article className="attention-summary card">
            <div className="card-header">
              <h3>Resumo humano do dia</h3>
              <span>{loading ? 'Atualizando...' : 'Atualizado agora'}</span>
            </div>
            <div className="card-body">
              <p className="attention-title">{attention?.daySummary.title ?? 'Sem dados de atenção no momento.'}</p>
              <p className="muted">{attention?.daySummary.detail ?? 'Ao carregar dados, o painel mostra um resumo acionável da operação diária.'}</p>
              <div className="pills">{(attention?.daySummary.highlights ?? ['0 em atraso', '0 aguardando confirmação', '0 tickets urgentes']).map((item) => <span key={item} className="pill pill-soft">{item}</span>)}</div>
            </div>
          </article>

          <article className="card">
            <div className="card-header"><h3>Ações rápidas</h3><span>5 CTAs essenciais</span></div>
            <div className="card-body">
              <div className="quick-actions-grid">
                {(attention?.quickActions ?? []).map((action) => (
                  <a key={action.id} href={action.href} className={`quick-action-card ${toneClass(action.tone)}`}>
                    <strong>{action.label}</strong>
                    <span>{action.detail}</span>
                  </a>
                ))}
                {!attention?.quickActions?.length ? <div className="empty">Sem ações rápidas disponíveis (fallback de UI).</div> : null}
              </div>
            </div>
          </article>

          <article className="card">
            <div className="card-header"><h3>Atenção necessária por prioridade</h3><span>Ordem de execução</span></div>
            <div className="card-body">
              <div className="priority-columns">
                {(['high', 'medium', 'low'] as const).map((priority) => (
                  <div key={priority} className="priority-column">
                    <h4 className={`priority-title ${toneClass(priority === 'high' ? 'critical' : priority === 'medium' ? 'warning' : 'info')}`}>{priority === 'high' ? 'Alta' : priority === 'medium' ? 'Média' : 'Baixa'}</h4>
                    {(attention?.attentionByPriority?.[priority] ?? []).map((item) => (
                      <a key={item.id} href={item.href} className="priority-item">
                        <strong>{item.title}</strong>
                        <span>{item.detail}</span>
                        <em>{item.cta}</em>
                      </a>
                    ))}
                    {(attention?.attentionByPriority?.[priority] ?? []).length === 0 ? <div className="empty">Sem itens nesta prioridade.</div> : null}
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="card">
            <div className="card-header"><h3>KPIs acionáveis</h3><span>8 indicadores com próximo passo</span></div>
            <div className="card-body">
              <div className="kpi-grid">
                {(attention?.kpis ?? []).map((kpi) => (
                  <a key={kpi.id} href={kpi.href} className={`kpi-card ${toneClass(kpi.status)}`}>
                    <div className="label">{kpi.label}</div>
                    <div className="value">{kpiValue(kpi.value, kpi.format)}</div>
                    <div className="hint">{kpi.actionLabel}</div>
                  </a>
                ))}
                {!attention?.kpis?.length ? <div className="empty">Sem KPIs disponíveis (fallback de UI).</div> : null}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section" id="cadastros">
        <div className="section-header">
          <div>
            <h2 className="section-title">Base do portfólio</h2>
            <p>Registe imóveis, unidades e inquilinos para começar a cobrar com contexto completo.</p>
          </div>
          {loading ? <span className="pill pill-soft">Sincronizando...</span> : <span className="pill pill-positive">Online</span>}
        </div>
        {notice ? <div className={`notice ${notice.kind === 'success' ? 'notice-success' : 'notice-error'}`}>{notice.text}</div> : null}
        <div className="grid-3">
          <Panel title="Imóveis" subtitle={`${propertyOptions.length} registados`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/properties', payload(form), 'Imóvel registado com sucesso.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o imóvel.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="property-name">Nome</label><input id="property-name" name="name" required /></div>
                <div className="field"><label htmlFor="property-address1">Endereço</label><input id="property-address1" name="addressLine1" required /></div>
                <div className="field"><label htmlFor="property-city">Cidade</label><input id="property-city" name="city" required /></div>
                <div className="field"><label htmlFor="property-region">Região</label><input id="property-region" name="region" required /></div>
                <div className="field"><label htmlFor="property-postal">Código postal</label><input id="property-postal" name="postalCode" required /></div>
                <div className="field"><label htmlFor="property-country">País</label><input id="property-country" name="country" defaultValue="Portugal" /></div>
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
          <Panel title="Unidades" subtitle={`${unitOptions.length} registadas`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/units', payload(form), 'Unidade registada com sucesso.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar a unidade.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="unit-property">Imóvel</label><select id="unit-property" name="propertyId" required defaultValue=""><option value="" disabled>Selecionar</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field"><label htmlFor="unit-name">Nome</label><input id="unit-name" name="name" required /></div>
                <div className="field"><label htmlFor="unit-rent">Renda mensal</label><input id="unit-rent" name="monthlyRent" type="number" step="0.01" required /></div>
                <div className="field"><label htmlFor="unit-status">Estado</label><select id="unit-status" name="status" defaultValue="Vacant"><option value="Vacant">Vacant</option><option value="Occupied">Occupied</option><option value="Maintenance">Maintenance</option></select></div>
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
                <span className={chipClass(unit.status as string)}>{unit.status as string}</span>
              </div>
            )} />
          </Panel>

          <Panel title="Inquilinos" subtitle={`${renterOptions.length} registados`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/renters', payload(form), 'Inquilino registado com sucesso.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o inquilino.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="renter-name">Nome completo</label><input id="renter-name" name="fullName" required /></div>
                <div className="field"><label htmlFor="renter-email">Email</label><input id="renter-email" name="email" type="email" /></div>
                <div className="field"><label htmlFor="renter-phone">Telefone</label><input id="renter-phone" name="phone" /></div>
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
        </div>
      </section>

      <section className="section" id="contratos">
        <div className="section-header">
          <div>
            <h2 className="section-title">Contratos de arrendamento</h2>
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
                <span className={chipClass(lease.status as string)}>{lease.status as string}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section>
      <section className="section" id="financeiro">
        <div className="section-header">
          <div>
            <h2 className="section-title">Cobrança e pagamentos</h2>
            <p>Emita cobranças mensais e confirme pagamentos com uma linguagem clara para o dia a dia do senhorio.</p>
          </div>
          <span className="pill pill-soft">A receber: {finances ? money(finances.openInvoices) : '€0'}</span>
        </div>
        <div className="grid-2">
          <Panel title="Gerar cobranças" subtitle="Cobrança mensal automática">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/invoices/generate', payload(form), 'Cobranças geradas com sucesso.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível gerar as cobranças.' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="invoice-period">Período</label><input id="invoice-period" name="period" type="month" defaultValue={new Date().toISOString().slice(0, 7)} /></div>
                <div className="field"><label>Contratos ativos</label><input value={`${activeLeaseCount}`} readOnly /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={activeLeaseCount === 0 || submitting === '/api/invoices/generate'}>{submitting === '/api/invoices/generate' ? 'A gerar...' : 'Gerar cobranças do período'}</button></div>
            </form>
            <RecordList items={state.invoices} empty={{ title: 'Ainda não há cobranças emitidas.', hint: 'Escolha o período e gere cobranças para os contratos ativos.', actionLabel: 'Gerar cobranças agora', actionHref: '#invoice-period' }} render={(invoice) => (
              <div key={invoice.id} className="empty">
                <strong>{invoice.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{periodLabel(invoice.period as string)} · {money(Number(invoice.amount ?? 0))}</span><br />
                <span className={chipClass(invoice.status as string)}>{invoice.status as string}</span>
                <div className="table-actions" style={{ marginTop: 10 }}>
                  <button
                    className="small-button"
                    type="button"
                    disabled={!invoice.lease?.renter?.phone || sendingInvoiceId === invoice.id}
                    onClick={() => void sendInvoiceViaWhatsApp(invoice)}
                  >
                    {sendingInvoiceId === invoice.id
                      ? 'A enviar...'
                      : invoice.lease?.renter?.phone
                        ? 'Enviar por WhatsApp'
                        : 'Sem telefone'}
                  </button>
                </div>
              </div>
            )} />
          </Panel>

          <Panel title="Registar pagamento" subtitle="Baixa e reconciliação manual">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/payments', payload(form), 'Pagamento registado e enviado para confirmação.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível registar o pagamento.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="payment-invoice">Fatura</label><select id="payment-invoice" name="invoiceId" required defaultValue=""><option value="" disabled>Selecionar</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></div>
                <div className="field"><label htmlFor="payment-amount">Valor</label><input id="payment-amount" name="amount" type="number" step="0.01" /></div>
                <div className="field"><label htmlFor="payment-method">Método</label><select id="payment-method" name="method" defaultValue="Bank transfer"><option>Bank transfer</option><option>Cash</option><option>Card</option><option>MB Way</option><option>Stripe</option></select></div>
                <div className="field field-full"><label htmlFor="payment-reference">Referência</label><input id="payment-reference" name="reference" /></div>
                <div className="field field-full"><label htmlFor="payment-notes">Notas</label><textarea id="payment-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={invoiceOptions.length === 0 || submitting === '/api/payments'}>{submitting === '/api/payments' ? 'A registar...' : 'Registar pagamento'}</button></div>
            </form>
            <RecordList items={state.payments} empty={{ title: 'Ainda não há pagamentos registados.', hint: 'Selecione uma cobrança em aberto para registar o primeiro pagamento.', actionLabel: 'Registar pagamento', actionHref: '#payment-invoice' }} render={(payment) => (
              <div key={payment.id} className="empty">
                <strong>{payment.invoice?.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{dateTime(payment.paidAt)} · {money(Number(payment.amount ?? 0))} · {payment.method as string}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section>

      <section className="section" id="operacao">
        <div className="section-header">
          <div>
            <h2 className="section-title">Operação e manutenção</h2>
            <p>Abra pedidos de manutenção com prioridade e acompanhe o estado sem perder contexto.</p>
          </div>
          <span className="pill pill-soft">Tickets: {state.maintenance.length}</span>
        </div>
        <div className="grid-2">
          <Panel title="Nova manutenção" subtitle="Abrir chamado">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/maintenance', payload(form), 'Pedido de manutenção criado com sucesso.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o pedido de manutenção.' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="ticket-title">Título</label><input id="ticket-title" name="title" required /></div>
                <div className="field"><label htmlFor="ticket-property">Imóvel</label><select id="ticket-property" name="propertyId" defaultValue=""><option value="">Opcional</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field"><label htmlFor="ticket-unit">Unidade</label><select id="ticket-unit" name="unitId" defaultValue=""><option value="">Opcional</option>{unitOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></div>
                <div className="field"><label htmlFor="ticket-priority">Prioridade</label><select id="ticket-priority" name="priority" defaultValue="Normal"><option>Low</option><option>Normal</option><option>High</option><option>Urgent</option></select></div>
                <div className="field"><label htmlFor="ticket-status">Estado</label><select id="ticket-status" name="status" defaultValue="Open"><option>Open</option><option>In progress</option><option>Resolved</option></select></div>
                <div className="field field-full"><label htmlFor="ticket-description">Descrição</label><textarea id="ticket-description" name="description" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/maintenance'}>{submitting === '/api/maintenance' ? 'A criar...' : 'Criar ticket'}</button></div>
            </form>
          </Panel>

          <Panel title="Tickets recentes" subtitle="Operação diária">
            <RecordList items={state.maintenance} empty={{ title: 'Ainda não há pedidos de manutenção.', hint: 'Registe o primeiro pedido para manter histórico e prioridade da operação.', actionLabel: 'Abrir pedido de manutenção', actionHref: '#ticket-title' }} render={(ticket) => (
              <div key={ticket.id} className="empty">
                <strong>{ticket.title as string}</strong><br />
                <span className="muted">{ticket.property?.name ?? '—'} {ticket.unit?.name ? `· ${ticket.unit?.name}` : ''}</span><br />
                <span className={chipClass(ticket.status as string)}>{ticket.status as string}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section>

      <footer className="footer-note">
        {loading ? 'A atualizar dados do senhorio...' : 'Painel pronto para decisão: um próximo passo por bloco.'}
      </footer>
    </main>
  )
}
