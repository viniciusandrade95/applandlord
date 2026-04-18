const TICKET_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent']
const TICKET_STATUSES = ['New', 'Triaged', 'Waiting', 'Resolved', 'Closed']

const TICKET_TRANSITIONS = {
  New: ['Triaged', 'Waiting', 'Resolved', 'Closed'],
  Triaged: ['Waiting', 'Resolved', 'Closed'],
  Waiting: ['Triaged', 'Resolved', 'Closed'],
  Resolved: ['Waiting', 'Closed'],
  Closed: [],
}

function normalizeTicketPriority(value, fallback = 'Normal') {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  if (!TICKET_PRIORITIES.includes(normalized)) {
    throw new Error(`Invalid ticket priority: ${value}`)
  }
  return normalized
}

function normalizeTicketStatus(value, fallback = 'New') {
  const normalized = String(value ?? '').trim()
  if (!normalized) return fallback
  if (!TICKET_STATUSES.includes(normalized)) {
    throw new Error(`Invalid ticket status: ${value}`)
  }
  return normalized
}

function assertTicketTransitionAllowed({ fromStatus, toStatus }) {
  const normalizedFrom = normalizeTicketStatus(fromStatus)
  const normalizedTo = normalizeTicketStatus(toStatus)

  if (normalizedFrom === normalizedTo) {
    throw new Error('Transition to the same ticket status is not allowed')
  }

  if (!TICKET_TRANSITIONS[normalizedFrom].includes(normalizedTo)) {
    throw new Error(`Invalid ticket transition from ${normalizedFrom} to ${normalizedTo}`)
  }

  return { normalizedFrom, normalizedTo }
}

function applyTicketFlow(initialStatus, steps) {
  const events = []
  let current = normalizeTicketStatus(initialStatus)

  for (const next of steps) {
    const { normalizedFrom, normalizedTo } = assertTicketTransitionAllowed({ fromStatus: current, toStatus: next })
    current = normalizedTo
    events.push({ type: 'StatusChanged', fromStatus: normalizedFrom, toStatus: normalizedTo })
  }

  return { status: current, events }
}

module.exports = {
  normalizeTicketPriority,
  normalizeTicketStatus,
  assertTicketTransitionAllowed,
  applyTicketFlow,
}
