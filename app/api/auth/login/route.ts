import { NextResponse } from 'next/server'
import { asString } from '@/lib/landlord'
import { authenticateWithPassword, setSessionCookie } from '@/lib/auth'
import { logStructured, toErrorMessage } from '@/lib/observability'
import { enforceRateLimit } from '@/lib/rate-limit'
import { ValidationError, validateEmail, validatePassword } from '@/lib/security'

export async function POST(request: Request) {
  try {
    const rateLimit = enforceRateLimit(request, 'auth-login', 10, 60_000)

    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      )
    }

    const body = await request.json()
    const email = validateEmail(asString(body.email))
    const password = validatePassword(asString(body.password))

    const user = await authenticateWithPassword(email, password)

    if (!user) {
      logStructured({
        level: 'warn',
        event: 'AUTH_LOGIN_INVALID_CREDENTIALS',
        message: 'Failed login due to invalid credentials',
        context: { email },
      })

      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    })

    setSessionCookie(response, user.id)
    return response
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        {
          error: error.message,
          details: error.details,
        },
        { status: error.status }
      )
    }

    const message = toErrorMessage(error, 'Failed to login')

    logStructured({
      level: 'error',
      event: 'AUTH_LOGIN_UNHANDLED',
      message,
    })

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
