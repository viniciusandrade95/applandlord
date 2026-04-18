import { NextResponse } from 'next/server'
import { logStructured, toErrorMessage } from '@/lib/observability'
import { enforceRateLimit } from '@/lib/rate-limit'
import { assertBearerSecret, assertRequiredSecrets, validateIsoDate, ValidationError } from '@/lib/security'
import { runDailyReminderJob } from '@/lib/whatsapp-reminders'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    assertRequiredSecrets(['REMINDER_JOB_SECRET'])
    assertBearerSecret(request, 'x-reminder-job-secret', process.env.REMINDER_JOB_SECRET as string)

    const rateLimit = enforceRateLimit(request, 'reminder-job', 12, 60_000)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, error: 'Reminder job rate limit exceeded' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
      )
    }

    const body = await request.json().catch(() => ({}))
    const referenceDate = body?.referenceDate
      ? validateIsoDate(body.referenceDate, 'referenceDate')
      : new Date()

    const summary = await runDailyReminderJob(referenceDate)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message, details: error.details }, { status: error.status })
    }

    const message = toErrorMessage(error, 'Failed to execute reminder daily job')

    logStructured({
      level: 'error',
      event: 'REMINDER_DAILY_JOB_ERROR',
      message,
    })

    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
