export const TICKET_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const
export const TICKET_STATUSES = ['New', 'Triaged', 'Waiting', 'Resolved', 'Closed'] as const

export type TicketPriority = (typeof TICKET_PRIORITIES)[number]
export type TicketStatus = (typeof TICKET_STATUSES)[number]

const TICKET_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  New: ['Triaged', 'Waiting', 'Resolved', 'Closed'],
  Triaged: ['Waiting', 'Resolved', 'Closed'],
  Waiting: ['Triaged', 'Resolved', 'Closed'],
  Resolved: ['Waiting', 'Closed'],
  Closed: [],
}

/**
 * Objetivo: normalizar prioridade de ticket para conjunto permitido com fallback seguro.
 * Entrada: valor desconhecido (string/undefined) e fallback opcional.
 * Saída: prioridade válida (`Low|Normal|High|Urgent`).
 * Erros: lança Error quando valor inválido e sem fallback válido.
 * Efeitos colaterais: nenhum (função pura).
 */
export function normalizeTicketPriority(value: unknown, fallback: TicketPriority = 'Normal'): TicketPriority {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  if (TICKET_PRIORITIES.includes(normalized as TicketPriority)) {
    return normalized as TicketPriority
  }
  throw new Error(`Invalid ticket priority: ${value}`)
}

/**
 * Objetivo: normalizar estado de ticket para máquina formal.
 * Entrada: valor desconhecido e fallback opcional.
 * Saída: estado válido (`New|Triaged|Waiting|Resolved|Closed`).
 * Erros: lança Error quando valor inválido e sem fallback válido.
 * Efeitos colaterais: nenhum (função pura).
 */
export function normalizeTicketStatus(value: unknown, fallback: TicketStatus = 'New'): TicketStatus {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  if (TICKET_STATUSES.includes(normalized as TicketStatus)) {
    return normalized as TicketStatus
  }
  throw new Error(`Invalid ticket status: ${value}`)
}

/**
 * Objetivo: validar transição de estado de ticket e devolver estados normalizados.
 * Entrada: fromStatus/toStatus em formato livre.
 * Saída: objeto com `normalizedFrom` e `normalizedTo`.
 * Erros: lança Error para estado inválido, transição idêntica ou transição proibida.
 * Efeitos colaterais: nenhum (função pura).
 */
export function assertTicketTransitionAllowed(input: { fromStatus: unknown; toStatus: unknown }) {
  const normalizedFrom = normalizeTicketStatus(input.fromStatus)
  const normalizedTo = normalizeTicketStatus(input.toStatus)

  if (normalizedFrom === normalizedTo) {
    throw new Error('Transition to the same ticket status is not allowed')
  }

  if (!TICKET_TRANSITIONS[normalizedFrom].includes(normalizedTo)) {
    throw new Error(`Invalid ticket transition from ${normalizedFrom} to ${normalizedTo}`)
  }

  return { normalizedFrom, normalizedTo }
}

/**
 * Objetivo: calcular carimbos temporais decorrentes de uma transição de ticket.
 * Entrada: estado de origem, estado de destino e referência temporal opcional.
 * Saída: objeto parcial com campos (`triagedAt`, `waitingAt`, `resolvedAt`, `closedAt`, `currentEventAt`).
 * Erros: propaga erro de transição inválida.
 * Efeitos colaterais: nenhum (função pura).
 */
export function ticketTransitionTimestamps(input: {
  fromStatus: unknown
  toStatus: unknown
  now?: Date
}) {
  const { normalizedFrom, normalizedTo } = assertTicketTransitionAllowed(input)
  const now = input.now ?? new Date()

  return {
    normalizedFrom,
    normalizedTo,
    patch: {
      triagedAt: normalizedTo === 'Triaged' ? now : undefined,
      waitingAt: normalizedTo === 'Waiting' ? now : undefined,
      resolvedAt: normalizedTo === 'Resolved' ? now : undefined,
      closedAt: normalizedTo === 'Closed' ? now : undefined,
      currentEventAt: now,
    },
  }
}
