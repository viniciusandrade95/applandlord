'use client'

import { FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

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
    monthlyPayments: number
    openInvoices: number
    collectionRate: number
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
  if (['pending', 'partial', 'vacant', 'open', 'normal'].includes(normalized)) return 'chip chip-warning'
  if (['overdue', 'ended', 'urgent', 'cancelled'].includes(normalized)) return 'chip chip-danger'
  return 'chip chip-accent'
}

function payload(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries())
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

function RecordList({ items, empty, render }: { items: Row[]; empty: string; render: (row: Row) => ReactNode }) {
  if (!items.length) return <div className="empty">{empty}</div>

  return <div className="stack">{items.map(render)}</div>
}

export default function Home() {
  const [state, setState] = useState<State>(initialState)
  const [notice, setNotice] = useState<Notice>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const endpoints = ['/api/dashboard', '/api/properties', '/api/units', '/api/renters', '/api/leases', '/api/invoices', '/api/payments', '/api/maintenance']
      const responses = await Promise.all(endpoints.map((endpoint) => fetch(endpoint)))
      const data = await Promise.all(
        responses.map(async (response) => {
          const body = await response.json().catch(() => null)
          if (!response.ok) throw new Error(body?.error || 'Falha ao carregar dados')
          return body
        })
      )

      setState({ dashboard: data[0], properties: data[1], units: data[2], renters: data[3], leases: data[4], invoices: data[5], payments: data[6], maintenance: data[7] })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar painel' })
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
      if (!response.ok) throw new Error(data?.error || 'Falha na operação')
      setNotice({ kind: 'success', text: message })
      await load()
    } finally {
      setSubmitting(null)
    }
  }

  const dashboard = state.dashboard
  const counts = dashboard?.counts
  const finances = dashboard?.finances
  const propertyOptions = useMemo(() => state.properties.map((property) => ({ id: property.id as string, label: property.name as string })), [state.properties])
  const unitOptions = useMemo(
    () => state.units.map((unit) => ({ id: unit.id as string, label: `${unit.name as string} · ${(unit.property?.name as string) ?? 'Imóvel'}` })),
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
      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="eyebrow">Applandlord MVP</span>
            <h1>Imóveis, contratos e cobranças num só painel.</h1>
            <p className="hero-copy">
              Este painel cobre o fluxo principal de gestão imobiliária: criar propriedades, ligar unidades, cadastrar inquilinos, assinar contratos, gerar cobranças e dar baixa em pagamentos.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#cadastros">Começar pelos cadastros</a>
              <a className="button button-secondary" href="#financeiro">Ir para o financeiro</a>
            </div>
            <div className="summary-grid">
              <article className="summary-card"><div className="label">Imóveis</div><div className="value">{counts?.properties ?? 0}</div><div className="hint">Portfólio ativo</div></article>
              <article className="summary-card"><div className="label">Unidades</div><div className="value">{counts?.units ?? 0}</div><div className="hint">{counts ? `${counts.occupiedUnits} ocupadas` : 'Estrutura operacional'}</div></article>
              <article className="summary-card"><div className="label">A receber</div><div className="value">{finances ? money(finances.openInvoices) : '€0'}</div><div className="hint">Saldo aberto</div></article>
              <article className="summary-card"><div className="label">Receita do mês</div><div className="value">{finances ? money(finances.monthlyPayments) : '€0'}</div><div className="hint">Pagamentos liquidados</div></article>
            </div>
          </div>
          <aside className="status-panel">
            <h2>Centro de comando</h2>
            <p>O ciclo MVP já está operacional e sem dependências externas. Os dados são gravados via Prisma/PostgreSQL e aparecem em tempo real no painel.</p>
            <div className="pills">
              <span className="pill pill-soft">CRUD principal</span>
              <span className="pill pill-positive">Cobrança manual</span>
              <span className="pill pill-warning">Manutenção opcional</span>
            </div>
            <div className="stack-sm">
              <div className="pill pill-soft">Contratos ativos: {counts?.activeLeases ?? 0}</div>
              <div className="pill pill-soft">Cobranças em atraso: {counts?.overdueInvoices ?? 0}</div>
              <div className="pill pill-soft">Taxa de recebimento: {finances?.collectionRate ?? 0}%</div>
            </div>
          </aside>
        </div>
      </section>

      <section className="section" id="cadastros">
        <div className="section-header">
          <div>
            <h2 className="section-title">Cadastros</h2>
            <p>Primeiro passo do fluxo: propriedade, unidade e inquilino.</p>
          </div>
          {loading ? <span className="pill pill-soft">Sincronizando...</span> : <span className="pill pill-positive">Online</span>}
        </div>
        {notice ? <div className={`notice ${notice.kind === 'success' ? 'notice-success' : 'notice-error'}`}>{notice.text}</div> : null}
        <div className="grid-3">
          <Panel title="Propriedades" subtitle={`${propertyOptions.length} registadas`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/properties', payload(form), 'Imóvel criado.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar imóvel' }) } }}>
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
            <RecordList items={state.properties} empty="Ainda não há propriedades." render={(property) => (
              <div key={property.id} className="empty">
                <strong>{property.name as string}</strong><br />
                <span className="muted">{property.addressLine1 as string}, {(property.city as string) ?? ''}</span>
              </div>
            )} />
          </Panel>
          <Panel title="Unidades" subtitle={`${unitOptions.length} registadas`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/units', payload(form), 'Unidade criada.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar unidade' }) } }}>
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
            <RecordList items={state.units} empty="Ainda não há unidades." render={(unit) => (
              <div key={unit.id} className="empty">
                <strong>{unit.name as string}</strong><br />
                <span className="muted">{unit.property?.name ?? '—'} · {money(Number(unit.monthlyRent ?? 0))}</span><br />
                <span className={chipClass(unit.status as string)}>{unit.status as string}</span>
              </div>
            )} />
          </Panel>

          <Panel title="Inquilinos" subtitle={`${renterOptions.length} registados`}>
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/renters', payload(form), 'Inquilino criado.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar inquilino' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="renter-name">Nome completo</label><input id="renter-name" name="fullName" required /></div>
                <div className="field"><label htmlFor="renter-email">Email</label><input id="renter-email" name="email" type="email" /></div>
                <div className="field"><label htmlFor="renter-phone">Telefone</label><input id="renter-phone" name="phone" /></div>
                <div className="field field-full"><label htmlFor="renter-id">Documento / NIF</label><input id="renter-id" name="governmentId" /></div>
                <div className="field field-full"><label htmlFor="renter-notes">Notas</label><textarea id="renter-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={submitting === '/api/renters'}>{submitting === '/api/renters' ? 'A criar...' : 'Criar inquilino'}</button></div>
            </form>
            <RecordList items={state.renters} empty="Ainda não há inquilinos." render={(renter) => (
              <div key={renter.id} className="empty">
                <strong>{renter.fullName as string}</strong><br />
                <span className="muted">{renter.email ? (renter.email as string) : 'Sem email'} · {renter.phone ? (renter.phone as string) : 'Sem telefone'}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Contratos</h2>
            <p>Conecte imóvel, unidade e inquilino e o sistema passa a controlar o aluguel.</p>
          </div>
          <span className="pill pill-soft">Ativos: {activeLeaseCount}</span>
        </div>
        <div className="grid-2">
          <Panel title="Criar contrato" subtitle="Vincular unidade e renda">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/leases', payload(form), 'Contrato criado.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar contrato' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="lease-property">Imóvel</label><select id="lease-property" name="propertyId" required defaultValue=""><option value="" disabled>Selecionar</option>{propertyOptions.map((property) => <option key={property.id} value={property.id}>{property.label}</option>)}</select></div>
                <div className="field"><label htmlFor="lease-unit">Unidade</label><select id="lease-unit" name="unitId" required defaultValue=""><option value="" disabled>Selecionar</option>{unitOptions.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}</select></div>
                <div className="field"><label htmlFor="lease-renter">Inquilino</label><select id="lease-renter" name="renterId" required defaultValue=""><option value="" disabled>Selecionar</option>{renterOptions.map((renter) => <option key={renter.id} value={renter.id}>{renter.label}</option>)}</select></div>
                <div className="field"><label htmlFor="lease-start">Início</label><input id="lease-start" name="startDate" type="date" required /></div>
                <div className="field"><label htmlFor="lease-rent">Renda</label><input id="lease-rent" name="monthlyRent" type="number" step="0.01" required /></div>
                <div className="field"><label htmlFor="lease-due">Dia de vencimento</label><input id="lease-due" name="dueDay" type="number" min="1" max="28" defaultValue={1} /></div>
                <div className="field"><label htmlFor="lease-deposit">Caução</label><input id="lease-deposit" name="depositAmount" type="number" step="0.01" /></div>
                <div className="field"><label htmlFor="lease-status">Estado</label><select id="lease-status" name="status" defaultValue="Active"><option value="Active">Active</option><option value="Planned">Planned</option><option value="Ended">Ended</option></select></div>
                <div className="field field-full"><label htmlFor="lease-notes">Notas</label><textarea id="lease-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={propertyOptions.length === 0 || unitOptions.length === 0 || renterOptions.length === 0 || submitting === '/api/leases'}>{submitting === '/api/leases' ? 'A criar...' : 'Criar contrato'}</button></div>
            </form>
          </Panel>

          <Panel title="Contratos ativos" subtitle="Visão rápida do portfólio">
            <RecordList items={state.leases} empty="Ainda não há contratos." render={(lease) => (
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
            <p>Gerar faturas mensais e dar baixa manual em pagamentos, sem sair do painel.</p>
          </div>
          <span className="pill pill-soft">A receber: {finances ? money(finances.openInvoices) : '€0'}</span>
        </div>
        <div className="grid-2">
          <Panel title="Gerar faturas" subtitle="Cobrança mensal automática">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/invoices/generate', payload(form), 'Faturas geradas.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao gerar faturas' }) } }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="invoice-period">Período</label><input id="invoice-period" name="period" type="month" defaultValue={new Date().toISOString().slice(0, 7)} /></div>
                <div className="field"><label>Contratos ativos</label><input value={`${activeLeaseCount}`} readOnly /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={activeLeaseCount === 0 || submitting === '/api/invoices/generate'}>{submitting === '/api/invoices/generate' ? 'A gerar...' : 'Gerar faturas'}</button></div>
            </form>
            <RecordList items={state.invoices} empty="Ainda não há faturas." render={(invoice) => (
              <div key={invoice.id} className="empty">
                <strong>{invoice.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{periodLabel(invoice.period as string)} · {money(Number(invoice.amount ?? 0))}</span><br />
                <span className={chipClass(invoice.status as string)}>{invoice.status as string}</span>
              </div>
            )} />
          </Panel>

          <Panel title="Registar pagamento" subtitle="Baixa e reconciliação manual">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/payments', payload(form), 'Pagamento registado.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao registar pagamento' }) } }}>
              <div className="form-grid">
                <div className="field field-full"><label htmlFor="payment-invoice">Fatura</label><select id="payment-invoice" name="invoiceId" required defaultValue=""><option value="" disabled>Selecionar</option>{invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.label}</option>)}</select></div>
                <div className="field"><label htmlFor="payment-amount">Valor</label><input id="payment-amount" name="amount" type="number" step="0.01" /></div>
                <div className="field"><label htmlFor="payment-method">Método</label><select id="payment-method" name="method" defaultValue="Bank transfer"><option>Bank transfer</option><option>Cash</option><option>Card</option><option>MB Way</option><option>Stripe</option></select></div>
                <div className="field field-full"><label htmlFor="payment-reference">Referência</label><input id="payment-reference" name="reference" /></div>
                <div className="field field-full"><label htmlFor="payment-notes">Notas</label><textarea id="payment-notes" name="notes" /></div>
              </div>
              <div className="form-actions"><button className="button button-primary" type="submit" disabled={invoiceOptions.length === 0 || submitting === '/api/payments'}>{submitting === '/api/payments' ? 'A registar...' : 'Registar pagamento'}</button></div>
            </form>
            <RecordList items={state.payments} empty="Ainda não há pagamentos." render={(payment) => (
              <div key={payment.id} className="empty">
                <strong>{payment.invoice?.lease?.renter?.fullName ?? '—'}</strong><br />
                <span className="muted">{dateTime(payment.paidAt)} · {money(Number(payment.amount ?? 0))} · {payment.method as string}</span>
              </div>
            )} />
          </Panel>
        </div>
      </section>

      <section className="section">
        <div className="section-header">
          <div>
            <h2 className="section-title">Operação</h2>
            <p>Tickets rápidos para manutenção de unidades e áreas comuns.</p>
          </div>
          <span className="pill pill-soft">Tickets: {state.maintenance.length}</span>
        </div>
        <div className="grid-2">
          <Panel title="Nova manutenção" subtitle="Abrir chamado">
            <form onSubmit={async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; try { await postJson('/api/maintenance', payload(form), 'Ticket criado.') ; form.reset() } catch (error) { setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar ticket' }) } }}>
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
            <RecordList items={state.maintenance} empty="Ainda não há tickets." render={(ticket) => (
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
        {loading ? 'Carregando dados...' : 'Painel pronto. O fluxo principal já está operacional.'}
      </footer>
    </main>
  )
}
