const RENT_CHARGE_STATES = ['Pending', 'Overdue', 'Partial', 'AwaitingConfirmation', 'Paid', 'Canceled']

const TRANSITIONS = {
  Pending: ['Overdue', 'Partial', 'AwaitingConfirmation', 'Paid', 'Canceled'],
  Overdue: ['Partial', 'AwaitingConfirmation', 'Paid', 'Canceled'],
  Partial: ['AwaitingConfirmation', 'Paid', 'Overdue', 'Canceled'],
  AwaitingConfirmation: ['Paid', 'Partial', 'Overdue', 'Canceled'],
  Paid: [],
  Canceled: [],
}

function normalizeRentChargeState(status) {
  const normalized = String(status ?? '').trim()
  if (!RENT_CHARGE_STATES.includes(normalized)) {
    throw new Error(`Invalid rent charge status: ${status}`)
  }
  return normalized
}

function assertRentChargeTransitionAllowed(input) {
  const normalizedFrom = normalizeRentChargeState(input.fromStatus)
  const normalizedTo = normalizeRentChargeState(input.toStatus)

  if (normalizedFrom === normalizedTo) {
    throw new Error('Transition to the same status is not allowed')
  }

  if (!TRANSITIONS[normalizedFrom].includes(normalizedTo)) {
    throw new Error(`Invalid transition from ${normalizedFrom} to ${normalizedTo}`)
  }

  return { normalizedFrom, normalizedTo }
}

module.exports = {
  normalizeRentChargeState,
  assertRentChargeTransitionAllowed,
}
