function asNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function asString(value, fallback = '') {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : fallback
}

function asDate(value, fallback) {
  if (!value) return fallback ?? new Date()
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? fallback ?? new Date() : parsed
}

function parseLeaseWizardPayload(body) {
  const raw = body ?? {}
  const renterMode = asString(raw.renterMode, 'existing') === 'new' ? 'new' : 'existing'
  const renterId = asString(raw.renterId)

  const newRenter =
    renterMode === 'new'
      ? {
          fullName: asString(raw.newRenterFullName),
          email: asString(raw.newRenterEmail) || null,
          phone: asString(raw.newRenterPhone) || null,
          governmentId: asString(raw.newRenterGovernmentId) || null,
          notes: asString(raw.newRenterNotes) || null,
        }
      : null

  if (renterMode === 'existing' && !renterId) {
    throw new Error('Selecione um inquilino existente para continuar.')
  }
  if (renterMode === 'new' && !newRenter.fullName) {
    throw new Error('Informe o nome completo do novo inquilino.')
  }

  const propertyId = asString(raw.propertyId)
  const unitId = asString(raw.unitId)
  const monthlyRent = asNumber(raw.monthlyRent)

  if (!propertyId || !unitId || monthlyRent <= 0) {
    throw new Error('Imóvel, unidade e renda mensal válida são obrigatórios.')
  }

  return {
    propertyId,
    unitId,
    renterId,
    startDate: asDate(raw.startDate),
    endDate: raw.endDate ? asDate(raw.endDate) : null,
    monthlyRent,
    depositAmount: Math.max(0, asNumber(raw.depositAmount, 0)),
    dueDay: asNumber(raw.dueDay, 1),
    status: asString(raw.status, 'Active'),
    notes: asString(raw.notes) || null,
    renterMode,
    newRenter,
  }
}

function validateLeaseSchedule(startDate, endDate, dueDay) {
  if (Number.isNaN(startDate.getTime())) throw new Error('Data de início inválida.')
  if (endDate && Number.isNaN(endDate.getTime())) throw new Error('Data de fim inválida.')
  if (endDate && endDate.getTime() < startDate.getTime()) throw new Error('A data de fim não pode ser anterior à data de início.')
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) throw new Error('O dia de vencimento deve estar entre 1 e 28.')
}

function validateLeaseRelations(params) {
  const { unitPropertyId, selectedPropertyId, unitStatus, activeLeaseCountForUnit } = params
  if (unitPropertyId !== selectedPropertyId) throw new Error('A unidade selecionada não pertence ao imóvel informado.')
  if (activeLeaseCountForUnit > 0) throw new Error('A unidade já possui contrato ativo.')
  if (asString(unitStatus).toLowerCase() === 'occupied') throw new Error('A unidade está marcada como ocupada e não pode receber novo contrato ativo.')
}

module.exports = { parseLeaseWizardPayload, validateLeaseRelations, validateLeaseSchedule }
