import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { sendTextMessage } from '@/lib/whatsapp'
import { handleWhatsappMenuMessage, shouldThrottleWhatsapp } from '@/lib/whatsapp-menu'

export const runtime = 'nodejs'

function validateSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) {
    return false
  }

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(signature)

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string
          text?: { body?: string }
        }>
      }
    }>
  }>
}

function extractMessagePayload(payload: WebhookPayload) {
  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const senderId = typeof message?.from === 'string' ? message.from : ''
  const text = typeof message?.text?.body === 'string' ? message.text.body.trim() : ''

  return { senderId, text }
}

function isAuthorizedAdmin(senderId: string) {
  const adminNumbers = process.env.WHATSAPP_ADMIN_NUMBERS
  if (!adminNumbers) {
    return true
  }

  const normalized = senderId.replace(/\D/g, '')
  const allowList = adminNumbers
    .split(',')
    .map((entry) => entry.replace(/\D/g, '').trim())
    .filter(Boolean)

  return allowList.includes(normalized)
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN

  if (!verifyToken) {
    return new NextResponse('Missing WHATSAPP_WEBHOOK_VERIFY_TOKEN', { status: 500 })
  }

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: Request) {
  try {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json(
        { success: false, error: 'Missing WHATSAPP_WEBHOOK_SECRET' },
        { status: 500 }
      )
    }

    const rawBody = await request.text()
    const signature =
      request.headers.get('x-hub-signature-256') ?? request.headers.get('x-hub-signature')

    if (!validateSignature(rawBody, signature, secret)) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook signature' },
        { status: 401 }
      )
    }

    const payload = JSON.parse(rawBody) as WebhookPayload
    const { senderId, text } = extractMessagePayload(payload)

    if (!senderId || !text) {
      return NextResponse.json({ success: true, ignored: true })
    }

    if (!isAuthorizedAdmin(senderId)) {
      await sendTextMessage(senderId, 'Numero nao autorizado para usar este menu.')
      return NextResponse.json({ success: false, error: 'Unauthorized sender' }, { status: 403 })
    }

    if (shouldThrottleWhatsapp(senderId)) {
      await sendTextMessage(senderId, 'Aguarde um momento antes de enviar outro comando.')
      return NextResponse.json({ success: true, throttled: true })
    }

    const reply = await handleWhatsappMenuMessage(senderId, text)
    await sendTextMessage(senderId, reply)
    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to handle WhatsApp webhook'
    console.error('WhatsApp webhook error', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
