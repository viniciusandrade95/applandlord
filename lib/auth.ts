import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'

const SESSION_COOKIE = 'applandlord_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7

function authSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('Missing AUTH_SECRET environment variable')
  }
  return secret
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString('base64url')
}

function fromBase64Url(value: string) {
  return Buffer.from(value, 'base64url').toString('utf-8')
}

function sign(payload: string) {
  return createHmac('sha256', authSecret()).update(payload).digest('base64url')
}

type SessionPayload = {
  userId: string
  exp: number
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + SESSION_TTL_MS,
  }

  const encodedPayload = toBase64Url(JSON.stringify(payload))
  const signature = sign(encodedPayload)
  return `${encodedPayload}.${signature}`
}

export function verifySessionToken(token: string | undefined | null) {
  if (!token) return null

  const [encodedPayload, receivedSignature] = token.split('.')
  if (!encodedPayload || !receivedSignature) return null

  const expectedSignature = sign(encodedPayload)
  const expectedBuffer = Buffer.from(expectedSignature)
  const receivedBuffer = Buffer.from(receivedSignature)

  if (expectedBuffer.length !== receivedBuffer.length) return null
  if (!timingSafeEqual(expectedBuffer, receivedBuffer)) return null

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as SessionPayload
  if (!payload?.userId || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null

  return payload
}

export async function getCurrentUserId() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  const payload = verifySessionToken(token)
  return payload?.userId ?? null
}

export async function requireCurrentUserId() {
  const userId = await getCurrentUserId()

  if (!userId) {
    return {
      userId: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    }
  }

  return { userId, response: null }
}

export function setSessionCookie(response: NextResponse, userId: string) {
  response.cookies.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false

  const computed = scryptSync(password, salt, 64)
  const provided = Buffer.from(hash, 'hex')

  if (computed.length !== provided.length) return false
  return timingSafeEqual(computed, provided)
}

export async function authenticateWithPassword(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail || password.length < 6) return null

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

  if (!user) {
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        name: normalizedEmail.split('@')[0],
      },
    })

    return created
  }

  if (user.passwordHash === 'CHANGE_ME_ON_FIRST_LOGIN') {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(password),
      },
    })

    return updated
  }

  if (!verifyPassword(password, user.passwordHash)) return null

  return user
}
