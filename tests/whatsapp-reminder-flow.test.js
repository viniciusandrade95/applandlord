const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveReminderTemplateName, computeRetryState } = require('./helpers/whatsapp-reminder-testable.js')

test('resolveReminderTemplateName retorna overdue para vencimento anterior', () => {
  const template = resolveReminderTemplateName(new Date('2026-04-10T10:00:00.000Z'), new Date('2026-04-18T10:00:00.000Z'))
  assert.equal(template, 'rent_overdue_notice')
})

test('resolveReminderTemplateName retorna reminder normal para vencimento no dia', () => {
  const template = resolveReminderTemplateName(new Date('2026-04-18T09:00:00.000Z'), new Date('2026-04-18T10:00:00.000Z'))
  assert.equal(template, 'rent_reminder_due')
})

test('computeRetryState agenda retry até limite máximo', () => {
  assert.deepEqual(computeRetryState(0, 3), {
    attemptNumber: 1,
    status: 'RetryScheduled',
  })

  assert.deepEqual(computeRetryState(1, 3), {
    attemptNumber: 2,
    status: 'RetryScheduled',
  })
})

test('computeRetryState marca falha final ao atingir limite de tentativas', () => {
  assert.deepEqual(computeRetryState(2, 3), {
    attemptNumber: 3,
    status: 'Failed',
  })
})
