import { NextResponse } from 'next/server'
import { asString } from '@/lib/landlord'
import { authenticateWithPassword, setSessionCookie } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = asString(body.email).toLowerCase()
    const password = asString(body.password)

    if (!email || password.length < 6) {
      return NextResponse.json({ error: 'email and password (min 6 chars) are required' }, { status: 400 })
    }

    const user = await authenticateWithPassword(email, password)

    if (!user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const response = NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
    })

    setSessionCookie(response, user.id)
    return response
  } catch {
    return NextResponse.json({ error: 'Failed to login' }, { status: 500 })
  }
}
