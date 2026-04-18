import { asDate, asNumber, asString } from '@/lib/landlord'

export type LeaseWizardPayload = {
  propertyId: string
  unitId: string
  renterId: string
  startDate: Date
  endDate: Date | null
  monthlyRent: number
  depositAmount: number
  dueDay: number
  status: string
  notes: string | null
  renterMode: 'existing' | 'new'
  newRenter: {
    fullName: string
    email: string | null
    phone: string | null
    governmentId: string | null
    notes: string | null
  } | null
}

/**
 * Objetivo: normalizar e validar payload do wizard de contrato antes da persistência.
 * Entradas: body bruto da request (objeto JSON sem tipagem confiável).
 * Saída: objeto tipado `LeaseWizardPayload` pronto para validações de domínio.
 * Erros: lança Error com mensagem amigável para campos obrigatórios ausentes.
 * Efeitos colaterais: nenhum (função pura).
 */
export function parseLeaseWizardPayload(body: unknown): LeaseWizardPayload {
  const raw = (body ?? {}) as Record<string, FormDataEntryValue | string | number | null | undefined>
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

  if (renterMode === 'new' && !newRenter?.fullName) {
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
    startDate: asDate(raw.startDate ? String(raw.startDate) : undefined),
    endDate: raw.endDate ? asDate(String(raw.endDate)) : null,
    monthlyRent,
    depositAmount: Math.max(0, asNumber(raw.depositAmount, 0)),
    dueDay: asNumber(raw.dueDay, 1),
    status: asString(raw.status, 'Active'),
    notes: asString(raw.notes) || null,
    renterMode,
    newRenter,
  }
}

/**
 * Objetivo: validar regras de negócio de datas e dia de vencimento.
 * Entradas: datas de início/fim e dueDay já normalizados.
 * Saída: void (lança erro em caso inválido).
 * Erros: lança Error com mensagens legíveis para API/UI.
 * Efeitos colaterais: nenhum.
 */
export function validateLeaseSchedule(startDate: Date, endDate: Date | null, dueDay: number) {
  if (Number.isNaN(startDate.getTime())) {
    throw new Error('Data de início inválida.')
  }

  if (endDate && Number.isNaN(endDate.getTime())) {
    throw new Error('Data de fim inválida.')
  }

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('A data de fim não pode ser anterior à data de início.')
  }

  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    throw new Error('O dia de vencimento deve estar entre 1 e 28.')
  }
}

/**
 * Objetivo: garantir consistência imóvel/unidade/status para criação do contrato.
 * Entradas: objeto unit e propertyId selecionados, além de contagem de contratos ativos.
 * Saída: void (lança erro se houver inconsistência).
 * Erros: mensagens claras para unidade inválida ou ocupada.
 * Efeitos colaterais: nenhum.
 */
export function validateLeaseRelations(params: {
  unitPropertyId: string
  selectedPropertyId: string
  unitStatus: string
  activeLeaseCountForUnit: number
}) {
  const { unitPropertyId, selectedPropertyId, unitStatus, activeLeaseCountForUnit } = params

  if (unitPropertyId !== selectedPropertyId) {
    throw new Error('A unidade selecionada não pertence ao imóvel informado.')
  }

  if (activeLeaseCountForUnit > 0) {
    throw new Error('A unidade já possui contrato ativo.')
  }

  if (asString(unitStatus).toLowerCase() === 'occupied') {
    throw new Error('A unidade está marcada como ocupada e não pode receber novo contrato ativo.')
  }
}
