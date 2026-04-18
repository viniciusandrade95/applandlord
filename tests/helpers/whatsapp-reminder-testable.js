function resolveReminderTemplateName(dueDate, referenceDate = new Date()) {
  const dueAt = new Date(dueDate)
  const today = new Date(referenceDate)
  dueAt.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return dueAt.getTime() < today.getTime() ? 'rent_overdue_notice' : 'rent_reminder_due'
}

function computeRetryState(attempts, maxAttempts = 3) {
  const attemptNumber = attempts + 1
  return attemptNumber >= maxAttempts
    ? { attemptNumber, status: 'Failed' }
    : { attemptNumber, status: 'RetryScheduled' }
}

module.exports = {
  resolveReminderTemplateName,
  computeRetryState,
}
