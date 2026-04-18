export const RENT_CHARGE_STATES = ['Pending', 'Overdue', 'Partial', 'AwaitingConfirmation', 'Paid', 'Canceled'] as const

export type RentChargeState = (typeof RENT_CHARGE_STATES)[number]

const TRANSITIONS: Record<RentChargeState, RentChargeState[]> = {
  Pending: ['Overdue', 'Partial', 'AwaitingConfirmation', 'Paid', 'Canceled'],
  Overdue: ['Partial', 'AwaitingConfirmation', 'Paid', 'Canceled'],
  Partial: ['AwaitingConfirmation', 'Paid', 'Overdue', 'Canceled'],
  AwaitingConfirmation: ['Paid', 'Partial', 'Overdue', 'Canceled'],
  Paid: [],
  Canceled: [],
}

export type RentChargeTransitionInput = {
  fromStatus: string
  toStatus: string
  note?: string | null
}

export type RentChargeTransitionValidationResult = {
  normalizedFrom: RentChargeState
  normalizedTo: RentChargeState
}

/**
 * Objetivo: normalizar e validar um status de cobrança para o conjunto oficial da máquina de estados.
 *
 * Entradas:
 * - status (string): estado a validar.
 *
 * Validações:
 * - trim obrigatório.
 * - case sensitive por convenção de domínio (`Pending`, `Overdue`, `Partial`, `AwaitingConfirmation`, `Paid`, `Canceled`).
 *
 * Saída:
 * - RentChargeState normalizado.
 *
 * Erros possíveis:
 * - Error quando o estado não pertence ao conjunto permitido.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function normalizeRentChargeState(status: string): RentChargeState {
  const normalized = status.trim() as RentChargeState
  if (!RENT_CHARGE_STATES.includes(normalized)) {
    throw new Error(`Invalid rent charge status: ${status}`)
  }
  return normalized
}

/**
 * Objetivo: validar se uma transição entre estados é permitida pela máquina de cobrança.
 *
 * Entradas:
 * - input.fromStatus (string): estado atual da cobrança.
 * - input.toStatus (string): estado alvo desejado.
 * - input.note (string opcional): justificativa da transição, sem validação semântica obrigatória.
 *
 * Regras:
 * - Transição para o mesmo estado é inválida.
 * - Deve existir no mapa TRANSITIONS.
 *
 * Saída:
 * - RentChargeTransitionValidationResult com estados normalizados.
 *
 * Erros possíveis:
 * - Error quando estado de origem/destino é inválido.
 * - Error quando transição não é permitida.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function assertRentChargeTransitionAllowed(
  input: RentChargeTransitionInput
): RentChargeTransitionValidationResult {
  const normalizedFrom = normalizeRentChargeState(input.fromStatus)
  const normalizedTo = normalizeRentChargeState(input.toStatus)

  if (normalizedFrom === normalizedTo) {
    throw new Error('Transition to the same status is not allowed')
  }

  const allowed = TRANSITIONS[normalizedFrom]
  if (!allowed.includes(normalizedTo)) {
    throw new Error(`Invalid transition from ${normalizedFrom} to ${normalizedTo}`)
  }

  return { normalizedFrom, normalizedTo }
}

/**
 * Objetivo: expor tabela de transições permitidas para documentação/observabilidade.
 *
 * Entradas: nenhuma.
 * Saída: objeto Record<RentChargeState, RentChargeState[]> imutável (cópia rasa por estado).
 * Erros possíveis: nenhum.
 * Efeitos colaterais: nenhum.
 */
export function getRentChargeTransitionMatrix() {
  return {
    Pending: [...TRANSITIONS.Pending],
    Overdue: [...TRANSITIONS.Overdue],
    Partial: [...TRANSITIONS.Partial],
    AwaitingConfirmation: [...TRANSITIONS.AwaitingConfirmation],
    Paid: [...TRANSITIONS.Paid],
    Canceled: [...TRANSITIONS.Canceled],
  }
}
