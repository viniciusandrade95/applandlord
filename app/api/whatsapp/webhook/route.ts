import { createHmac, timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { sendTextMessage } from '@/lib/whatsapp'
import { handleWhatsappMenuMessage, shouldThrottleWhatsapp } from '@/lib/whatsapp-menu'
import { processTenantInboundMessage } from '@/lib/tenant-inbound'

export const runtime = 'nodejs'

/**
 * Objetivo: validar assinatura HMAC SHA-256 do webhook WhatsApp.
 *
 * Entradas:
 * - rawBody (string): body bruto recebido.
 * - signature (string|null): cabeçalho `x-hub-signature-256`.
 * - secret (string): segredo compartilhado.
 *
 * Saída:
 * - boolean: `true` quando assinatura confere em comparação timing-safe.
 *
 * Erros possíveis:
 * - nenhum; retorna `false` para ausência/assinatura inválida.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
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
          id?: string
          from?: string
          text?: { body?: string }
        }>
      }
    }>
  }>
}

/**
 * Objetivo: extrair campos mínimos necessários para roteamento do webhook inbound.
 *
 * Entrada:
 * - payload (WebhookPayload): estrutura entregue pela Meta.
 *
 * Saída:
 * - `{ senderId, text, providerMessageId }` com strings já sanitizadas.
 *
 * Erros possíveis:
 * - nenhum; campos ausentes retornam string vazia.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
function extractMessagePayload(payload: WebhookPayload) {
  const message = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
  const senderId = typeof message?.from === 'string' ? message.from : ''
  const text = typeof message?.text?.body === 'string' ? message.text.body.trim() : ''
  const providerMessageId = typeof message?.id === 'string' ? message.id.trim() : ''

  return { senderId, text, providerMessageId }
}

function isAuthorizedAdmin(senderId: string) {
  const adminNumbers = process.env.WHATSAPP_ADMIN_NUMBERS
  if (!adminNumbers) {
    return false
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

/**
 * Objetivo: processar webhook inbound com separação de fluxos admin vs inquilino.
 *
 * Contrato de entrada:
 * - Header obrigatório: `x-hub-signature-256` (ou `x-hub-signature`).
 * - Body (Meta webhook): `entry[].changes[].value.messages[].{id,from,text.body}`.
 *
 * Contrato de saída:
 * - 200 `{ success: true }` quando processado.
 * - 200 `{ success: true, ignored: true }` quando payload sem mensagem utilizável.
 * - 200 `{ success: true, throttled: true }` quando limite anti-spam/admin.
 * - 401 `{ success: false, error: 'Invalid webhook signature' }` para assinatura inválida.
 * - 500 `{ success: false, error: string }` para falhas inesperadas.
 *
 * Autorização:
 * - Assinatura de webhook obrigatória.
 * - Números admin (env `WHATSAPP_ADMIN_NUMBERS`) usam menu operacional.
 * - Demais números seguem fluxo de inquilino vinculado a contrato ativo.
 *
 * Efeitos colaterais:
 * - envio de mensagem de resposta pelo WhatsApp provider.
 * - para inquilino: persistência em banco (`WhatsAppInboundEvent`, `WhatsAppMessage`, `Invoice`, `MaintenanceTicket`, `TicketEvent`, `AuditLog`) conforme intenção.
 */
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
    const { senderId, text, providerMessageId } = extractMessagePayload(payload)

    if (!senderId || !text) {
      return NextResponse.json({ success: true, ignored: true })
    }

    if (isAuthorizedAdmin(senderId)) {
      if (shouldThrottleWhatsapp(senderId)) {
        await sendTextMessage(senderId, 'Aguarde um momento antes de enviar outro comando.')
        return NextResponse.json({ success: true, throttled: true })
      }

      const reply = await handleWhatsappMenuMessage(senderId, text)
      await sendTextMessage(senderId, reply)
      return NextResponse.json({ success: true, flow: 'admin-menu' })
    }

    const tenantResult = await processTenantInboundMessage({
      senderPhone: senderId,
      messageBody: text,
      providerMessageId,
    })

    await sendTextMessage(senderId, tenantResult.reply)
    return NextResponse.json({
      success: true,
      flow: 'tenant-inbound',
      duplicate: tenantResult.duplicate,
      throttled: tenantResult.throttled,
      handled: tenantResult.handled,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to handle WhatsApp webhook'
    console.error('WhatsApp webhook error', { error: message })
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
