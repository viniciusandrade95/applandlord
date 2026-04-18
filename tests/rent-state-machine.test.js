const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeRentChargeState, assertRentChargeTransitionAllowed } = require('./helpers/rent-state-machine-testable.js')

test('normalizeRentChargeState aceita estados válidos', () => {
  assert.equal(normalizeRentChargeState('Pending'), 'Pending')
  assert.equal(normalizeRentChargeState('AwaitingConfirmation'), 'AwaitingConfirmation')
  assert.equal(normalizeRentChargeState('Paid'), 'Paid')
})

test('normalizeRentChargeState rejeita estado inválido', () => {
  assert.throws(() => normalizeRentChargeState('Unknown'), /Invalid rent charge status/)
})

test('assertRentChargeTransitionAllowed permite Partial -> AwaitingConfirmation', () => {
  const transition = assertRentChargeTransitionAllowed({ fromStatus: 'Partial', toStatus: 'AwaitingConfirmation' })
  assert.deepEqual(transition, { normalizedFrom: 'Partial', normalizedTo: 'AwaitingConfirmation' })
})

test('assertRentChargeTransitionAllowed permite AwaitingConfirmation -> Paid', () => {
  const transition = assertRentChargeTransitionAllowed({ fromStatus: 'AwaitingConfirmation', toStatus: 'Paid' })
  assert.deepEqual(transition, { normalizedFrom: 'AwaitingConfirmation', normalizedTo: 'Paid' })
})

test('assertRentChargeTransitionAllowed rejeita transição inválida Paid -> Pending', () => {
  assert.throws(
    () => assertRentChargeTransitionAllowed({ fromStatus: 'Paid', toStatus: 'Pending' }),
    /Invalid transition from Paid to Pending/
  )
})

test('assertRentChargeTransitionAllowed rejeita transição para o mesmo estado', () => {
  assert.throws(
    () => assertRentChargeTransitionAllowed({ fromStatus: 'Overdue', toStatus: 'Overdue' }),
    /same status/
  )
})
