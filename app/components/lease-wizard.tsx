'use client'

import { useMemo, useState } from 'react'

type Option = { id: string; label: string; propertyId?: string; monthlyRent?: number }

type Payload = Record<string, unknown>

type NoticeSetter = (notice: { kind: 'success' | 'error'; text: string } | null) => void

type LeaseWizardProps = {
  propertyOptions: Option[]
  unitOptions: Option[]
  renterOptions: Option[]
  submitting: string | null
  onSubmit: (endpoint: string, body: Payload, message: string) => Promise<void>
  setNotice: NoticeSetter
}

type Step = 1 | 2 | 3 | 4 | 5

const initialForm = {
  propertyId: '',
  unitId: '',
  renterMode: 'existing' as 'existing' | 'new',
  renterId: '',
  newRenterFullName: '',
  newRenterEmail: '',
  newRenterPhone: '',
  newRenterGovernmentId: '',
  newRenterNotes: '',
  startDate: '',
  endDate: '',
  monthlyRent: '',
  dueDay: '1',
  depositAmount: '',
  status: 'Active',
  notes: '',
}

/**
 * Objetivo: renderizar wizard de criação de contrato em 5 passos com validações progressivas.
 * Entradas: opções de imóvel/unidade/inquilino + callback de submissão.
 * Saída: JSX com fluxo completo (seleção, validação, confirmação e sucesso).
 * Erros: validações locais exibidas por `setNotice`; erros de API propagados pelo callback.
 * Efeitos colaterais: cria contrato via chamada HTTP e pode acionar criação de inquilino no backend.
 */
export function LeaseWizard({ propertyOptions, unitOptions, renterOptions, submitting, onSubmit, setNotice }: LeaseWizardProps) {
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState(initialForm)

  const filteredUnits = useMemo(
    () => unitOptions.filter((unit) => !form.propertyId || unit.propertyId === form.propertyId),
    [unitOptions, form.propertyId]
  )

  const selectedProperty = propertyOptions.find((p) => p.id === form.propertyId)
  const selectedUnit = unitOptions.find((u) => u.id === form.unitId)
  const selectedRenter = renterOptions.find((r) => r.id === form.renterId)

  function updateField<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function validateStep(currentStep: Step) {
    if (currentStep === 1) {
      if (!form.propertyId || !form.unitId) {
        setNotice({ kind: 'error', text: 'Selecione imóvel e unidade para avançar.' })
        return false
      }
    }

    if (currentStep === 2) {
      if (form.renterMode === 'existing' && !form.renterId) {
        setNotice({ kind: 'error', text: 'Selecione um inquilino existente.' })
        return false
      }

      if (form.renterMode === 'new' && !form.newRenterFullName.trim()) {
        setNotice({ kind: 'error', text: 'Informe o nome do novo inquilino.' })
        return false
      }
    }

    if (currentStep === 3) {
      const dueDay = Number(form.dueDay)
      const monthlyRent = Number(form.monthlyRent)

      if (!form.startDate || !Number.isFinite(monthlyRent) || monthlyRent <= 0) {
        setNotice({ kind: 'error', text: 'Data de início e renda mensal válida são obrigatórias.' })
        return false
      }

      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
        setNotice({ kind: 'error', text: 'Dia de vencimento deve estar entre 1 e 28.' })
        return false
      }

      if (form.endDate && new Date(form.endDate).getTime() < new Date(form.startDate).getTime()) {
        setNotice({ kind: 'error', text: 'Data fim não pode ser anterior ao início.' })
        return false
      }
    }

    return true
  }

  function goNext() {
    if (!validateStep(step)) return
    setNotice(null)
    setStep((prev) => (prev < 5 ? ((prev + 1) as Step) : prev))
  }

  function goBack() {
    setNotice(null)
    setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : prev))
  }

  async function createLease() {
    if (!validateStep(3)) return

    try {
      await onSubmit(
        '/api/leases',
        {
          propertyId: form.propertyId,
          unitId: form.unitId,
          renterMode: form.renterMode,
          renterId: form.renterId,
          newRenterFullName: form.newRenterFullName,
          newRenterEmail: form.newRenterEmail,
          newRenterPhone: form.newRenterPhone,
          newRenterGovernmentId: form.newRenterGovernmentId,
          newRenterNotes: form.newRenterNotes,
          startDate: form.startDate,
          endDate: form.endDate || null,
          monthlyRent: Number(form.monthlyRent),
          dueDay: Number(form.dueDay),
          depositAmount: form.depositAmount ? Number(form.depositAmount) : 0,
          status: form.status,
          notes: form.notes,
        },
        'Contrato criado com sucesso pelo wizard.'
      )
      setStep(5)
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Falha ao criar contrato.' })
    }
  }

  function resetWizard() {
    setForm(initialForm)
    setStep(1)
    setNotice(null)
  }

  return (
    <div className="stack">
      <div className="pill pill-soft">Passo {step} de 5</div>

      {step === 1 && (
        <div className="form-grid">
          <div className="field">
            <label>Imóvel</label>
            <select value={form.propertyId} onChange={(event) => {
              updateField('propertyId', event.target.value)
              updateField('unitId', '')
            }}>
              <option value="">Selecionar</option>
              {propertyOptions.map((property) => (
                <option key={property.id} value={property.id}>{property.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Unidade</label>
            <select value={form.unitId} onChange={(event) => updateField('unitId', event.target.value)}>
              <option value="">Selecionar</option>
              {filteredUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="form-grid">
          <div className="field field-full">
            <label>Modo do inquilino</label>
            <select value={form.renterMode} onChange={(event) => updateField('renterMode', event.target.value as 'existing' | 'new')}>
              <option value="existing">Selecionar existente</option>
              <option value="new">Criar novo</option>
            </select>
          </div>
          {form.renterMode === 'existing' ? (
            <div className="field field-full">
              <label>Inquilino existente</label>
              <select value={form.renterId} onChange={(event) => updateField('renterId', event.target.value)}>
                <option value="">Selecionar</option>
                {renterOptions.map((renter) => (
                  <option key={renter.id} value={renter.id}>{renter.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="field field-full"><label>Nome completo</label><input value={form.newRenterFullName} onChange={(event) => updateField('newRenterFullName', event.target.value)} /></div>
              <div className="field"><label>Email</label><input type="email" value={form.newRenterEmail} onChange={(event) => updateField('newRenterEmail', event.target.value)} /></div>
              <div className="field"><label>Telefone</label><input value={form.newRenterPhone} onChange={(event) => updateField('newRenterPhone', event.target.value)} /></div>
              <div className="field"><label>Documento</label><input value={form.newRenterGovernmentId} onChange={(event) => updateField('newRenterGovernmentId', event.target.value)} /></div>
              <div className="field field-full"><label>Notas do inquilino</label><textarea value={form.newRenterNotes} onChange={(event) => updateField('newRenterNotes', event.target.value)} /></div>
            </>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="form-grid">
          <div className="field"><label>Início</label><input type="date" value={form.startDate} onChange={(event) => updateField('startDate', event.target.value)} /></div>
          <div className="field"><label>Fim (opcional)</label><input type="date" value={form.endDate} onChange={(event) => updateField('endDate', event.target.value)} /></div>
          <div className="field"><label>Renda</label><input type="number" step="0.01" value={form.monthlyRent} onChange={(event) => updateField('monthlyRent', event.target.value)} /></div>
          <div className="field"><label>Dia vencimento</label><input type="number" min={1} max={28} value={form.dueDay} onChange={(event) => updateField('dueDay', event.target.value)} /></div>
          <div className="field"><label>Caução</label><input type="number" step="0.01" value={form.depositAmount} onChange={(event) => updateField('depositAmount', event.target.value)} /></div>
          <div className="field"><label>Estado</label><select value={form.status} onChange={(event) => updateField('status', event.target.value)}><option value="Active">Active</option><option value="Planned">Planned</option><option value="Ended">Ended</option></select></div>
          <div className="field field-full"><label>Notas</label><textarea value={form.notes} onChange={(event) => updateField('notes', event.target.value)} /></div>
        </div>
      )}

      {step === 4 && (
        <div className="empty">
          <strong>Confirmação do contrato</strong><br />
          <span className="muted">Imóvel: {selectedProperty?.label ?? '—'}</span><br />
          <span className="muted">Unidade: {selectedUnit?.label ?? '—'}</span><br />
          <span className="muted">Inquilino: {form.renterMode === 'existing' ? (selectedRenter?.label ?? '—') : form.newRenterFullName}</span><br />
          <span className="muted">Início: {form.startDate || '—'} · Fim: {form.endDate || 'Sem data'}</span><br />
          <span className="muted">Renda: {form.monthlyRent || '—'} · Vencimento: dia {form.dueDay}</span><br />
          <span className="muted">Caução: {form.depositAmount || '0'} · Estado: {form.status}</span>
        </div>
      )}

      {step === 5 && (
        <div className="empty">
          <strong>Contrato criado com sucesso.</strong><br />
          <span className="muted">O fluxo do wizard foi concluído e os dados foram persistidos.</span>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        <button className="button button-secondary" type="button" onClick={goBack} disabled={step === 1 || step === 5}>Voltar</button>

        {step < 4 && (
          <button className="button button-primary" type="button" onClick={goNext}>Próximo</button>
        )}

        {step === 4 && (
          <button className="button button-primary" type="button" onClick={() => void createLease()} disabled={submitting === '/api/leases'}>
            {submitting === '/api/leases' ? 'A criar...' : 'Confirmar e criar'}
          </button>
        )}

        {step === 5 && (
          <button className="button button-primary" type="button" onClick={resetWizard}>Criar novo contrato</button>
        )}
      </div>
    </div>
  )
}
