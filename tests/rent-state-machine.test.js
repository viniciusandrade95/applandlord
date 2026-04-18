const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeRentChargeState, assertRentChargeTransitionAllowed } = require('./helpers/rent-state-machine-testable.js')

test('normalizeRentChargeState aceita estados válidos', () => {
  assert.equal(normalizeRentChargeState('Pending'), 'Pending')
  assert.equal(normalizeRentChargeState('Paid'), 'Paid')
})

test('normalizeRentChargeState rejeita estado inválido', () => {
  assert.throws(() => normalizeRentChargeState('Unknown'), /Invalid rent charge status/)
})

test('assertRentChargeTransitionAllowed permite Pending -> Partial', () => {
  const transition = assertRentChargeTransitionAllowed({ fromStatus: 'Pending', toStatus: 'Partial' })
  assert.deepEqual(transition, { normalizedFrom: 'Pending', normalizedTo: 'Partial' })
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
