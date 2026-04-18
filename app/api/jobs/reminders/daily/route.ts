import { NextResponse } from 'next/server'
import { runDailyReminderJob } from '@/lib/whatsapp-reminders'

export const runtime = 'nodejs'

function isAuthorized(request: Request) {
  const secret = process.env.REMINDER_JOB_SECRET
  if (!secret) {
    throw new Error('Missing REMINDER_JOB_SECRET')
  }

  const provided = request.headers.get('x-reminder-job-secret')
  return provided === secret
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: 'Unauthorized reminder job call' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const referenceDate =
      typeof body?.referenceDate === 'string' && body.referenceDate.trim().length
        ? new Date(body.referenceDate)
        : new Date()

    if (Number.isNaN(referenceDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid referenceDate' }, { status: 400 })
    }

    const summary = await runDailyReminderJob(referenceDate)
    return NextResponse.json({ success: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to execute reminder daily job'
    console.error('Reminder daily job error', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
