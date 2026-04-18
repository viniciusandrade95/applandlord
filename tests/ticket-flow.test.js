const test = require('node:test')
const assert = require('node:assert/strict')
const {
  normalizeTicketPriority,
  normalizeTicketStatus,
  assertTicketTransitionAllowed,
  applyTicketFlow,
} = require('./helpers/ticket-flow-testable.js')

test('normalizeTicketPriority valida prioridades formais', () => {
  assert.equal(normalizeTicketPriority('High'), 'High')
  assert.equal(normalizeTicketPriority(undefined), 'Normal')
  assert.throws(() => normalizeTicketPriority('Critical'), /Invalid ticket priority/)
})

test('normalizeTicketStatus valida estados formais', () => {
  assert.equal(normalizeTicketStatus('New'), 'New')
  assert.equal(normalizeTicketStatus(''), 'New')
  assert.throws(() => normalizeTicketStatus('Open'), /Invalid ticket status/)
})

test('assertTicketTransitionAllowed permite New -> Triaged -> Waiting -> Resolved -> Closed', () => {
  assert.deepEqual(assertTicketTransitionAllowed({ fromStatus: 'New', toStatus: 'Triaged' }), {
    normalizedFrom: 'New',
    normalizedTo: 'Triaged',
  })
  assert.deepEqual(assertTicketTransitionAllowed({ fromStatus: 'Triaged', toStatus: 'Waiting' }), {
    normalizedFrom: 'Triaged',
    normalizedTo: 'Waiting',
  })
  assert.deepEqual(assertTicketTransitionAllowed({ fromStatus: 'Waiting', toStatus: 'Resolved' }), {
    normalizedFrom: 'Waiting',
    normalizedTo: 'Resolved',
  })
  assert.deepEqual(assertTicketTransitionAllowed({ fromStatus: 'Resolved', toStatus: 'Closed' }), {
    normalizedFrom: 'Resolved',
    normalizedTo: 'Closed',
  })
})

test('applyTicketFlow simula fluxo completo com timeline', () => {
  const result = applyTicketFlow('New', ['Triaged', 'Waiting', 'Resolved', 'Closed'])

  assert.equal(result.status, 'Closed')
  assert.equal(result.events.length, 4)
  assert.deepEqual(result.events[0], {
    type: 'StatusChanged',
    fromStatus: 'New',
    toStatus: 'Triaged',
  })
  assert.deepEqual(result.events[3], {
    type: 'StatusChanged',
    fromStatus: 'Resolved',
    toStatus: 'Closed',
  })
})

test('applyTicketFlow bloqueia regressão inválida Closed -> Waiting', () => {
  assert.throws(() => applyTicketFlow('Closed', ['Waiting']), /Invalid ticket transition from Closed to Waiting/)
})
