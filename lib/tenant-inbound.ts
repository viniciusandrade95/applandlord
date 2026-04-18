import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { logAuditEvent } from '@/lib/audit'

export const TENANT_INBOUND_INTENTS = [
  'tenant_claimed_paid',
  'tenant_problem_reported',
  'tenant_promised_tomorrow',
  'unknown',
] as const

export type TenantInboundIntent = (typeof TENANT_INBOUND_INTENTS)[number]

const PROBLEM_TICKET_KEYWORDS = [
  'problema',
  'avaria',
  'vazamento',
  'fuga',
  'infiltracao',
  'infiltração',
  'cano',
  'eletric',
  'luz',
  'agua',
  'água',
  'fechadura',
] as const

/**
 * Objetivo: normalizar número telefónico para comparações consistentes no fluxo inbound.
 *
 * Entradas:
 * - phone (string): número com ou sem pontuação.
 *
 * Validações:
 * - remove tudo que não seja dígito.
 *
 * Saída:
 * - string com apenas dígitos. Ex.: `+351 912-000-111` -> `351912000111`.
 *
 * Erros possíveis:
 * - nenhum (retorna string vazia para entradas sem dígitos).
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function normalizeInboundPhone(phone: string) {
  return phone.replace(/\D/g, '')
}

/**
 * Objetivo: classificar intenção textual do inquilino para acionar automações seguras.
 *
 * Entradas:
 * - rawMessage (string): texto recebido do webhook inbound.
 *
 * Validações:
 * - trim obrigatório para reduzir ruído.
 * - comparação case-insensitive com remoção de acentos.
 *
 * Saída:
 * - TenantInboundIntent (`tenant_claimed_paid|tenant_problem_reported|tenant_promised_tomorrow|unknown`).
 * - Exemplos:
 *   - "já paguei" => `tenant_claimed_paid`
 *   - "tenho problema na canalização" => `tenant_problem_reported`
 *   - "pago amanhã" => `tenant_promised_tomorrow`
 *
 * Erros possíveis:
 * - nenhum; mensagens não reconhecidas retornam `unknown`.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function parseTenantIntent(rawMessage: string): TenantInboundIntent {
  const normalized = rawMessage
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

  if (!normalized) return 'unknown'

  if (
    normalized.includes('ja paguei') ||
    normalized.includes('paguei') ||
    normalized.includes('ja transferi') ||
    normalized.includes('comprovativo')
  ) {
    return 'tenant_claimed_paid'
  }

  if (normalized.includes('pago amanha') || normalized.includes('amanha pago')) {
    return 'tenant_promised_tomorrow'
  }

  if (PROBLEM_TICKET_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return 'tenant_problem_reported'
  }

  return 'unknown'
}

/**
 * Objetivo: gerar chave determinística de idempotência para impedir processamento duplicado.
 *
 * Entradas:
 * - senderPhone (string): telefone de origem (normalizado internamente).
 * - messageBody (string): conteúdo textual recebido.
 * - providerMessageId (string opcional): id único da mensagem no provedor WhatsApp.
 *
 * Validações:
 * - se `providerMessageId` existir, vira fonte primária de deduplicação.
 * - fallback usa hash SHA-256 de telefone+mensagem normalizada.
 *
 * Saída:
 * - string no formato `provider:<id>` ou `hash:<sha256>`.
 *
 * Erros possíveis:
 * - nenhum (função pura).
 *
 * Efeitos colaterais:
 * - nenhum.
 */
export function computeInboundDedupeKey(input: {
  senderPhone: string
  messageBody: string
  providerMessageId?: string
}) {
  const providerMessageId = String(input.providerMessageId ?? '').trim()
  if (providerMessageId) {
    return `provider:${providerMessageId}`
  }

  const normalizedPhone = normalizeInboundPhone(input.senderPhone)
  const normalizedBody = input.messageBody.trim().toLowerCase()
  const digest = createHash('sha256').update(`${normalizedPhone}::${normalizedBody}`).digest('hex')
  return `hash:${digest}`
}

type TenantContext = {
  ownerId: string
  renterId: string
  leaseId: string
  propertyId: string
  unitId: string
  renterName: string
  activeInvoiceId: string | null
}

/**
 * Objetivo: resolver vínculo número -> inquilino -> contrato ativo -> cobrança ativa.
 *
 * Entradas:
 * - senderPhone (string): telefone recebido no webhook.
 *
 * Validações:
 * - pesquisa por dígitos normalizados do telefone.
 * - seleciona apenas contratos `Active`.
 * - prioriza contrato mais recente (`startDate desc`).
 *
 * Saída:
 * - TenantContext | null.
 * - `activeInvoiceId` é a primeira cobrança ativa (Pending/Overdue/Partial/AwaitingConfirmation) por vencimento.
 *
 * Erros possíveis:
 * - nenhum; quando não encontra vínculo retorna `null`.
 *
 * Efeitos colaterais:
 * - leitura em `Renter`, `Lease` e `Invoice`.
 */
export async function resolveTenantContextByPhone(senderPhone: string): Promise<TenantContext | null> {
  const normalizedPhone = normalizeInboundPhone(senderPhone)
  if (!normalizedPhone) {
    return null
  }

  const renters = await prisma.renter.findMany({
    where: { phone: { contains: normalizedPhone } },
    include: {
      leases: {
        where: { status: 'Active' },
        orderBy: { startDate: 'desc' },
        include: {
          invoices: {
            where: {
              status: {
                in: ['Pending', 'Overdue', 'Partial', 'AwaitingConfirmation'],
              },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
      },
    },
    take: 20,
  })

  const exactMatch = renters.find((renter) => normalizeInboundPhone(renter.phone ?? '') === normalizedPhone)
  const selectedRenter = exactMatch ?? renters[0]

  if (!selectedRenter || selectedRenter.leases.length === 0) {
    return null
  }

  const lease = selectedRenter.leases[0]
  const activeInvoiceId = lease.invoices[0]?.id ?? null

  return {
    ownerId: lease.ownerId,
    renterId: selectedRenter.id,
    leaseId: lease.id,
    propertyId: lease.propertyId,
    unitId: lease.unitId,
    renterName: selectedRenter.fullName,
    activeInvoiceId,
  }
}

/**
 * Objetivo: limitar rajadas de mensagens inbound por inquilino para evitar abuso e retrabalho.
 *
 * Entradas:
 * - ownerId (string): tenant dono dos dados.
 * - senderPhone (string): telefone de origem.
 * - now (Date opcional): relógio de referência (default agora).
 *
 * Validações:
 * - janela fixa de 1 minuto.
 * - limite de 5 mensagens processadas por janela.
 *
 * Saída:
 * - Promise<boolean>: `true` quando deve throttlar, `false` quando permitido.
 *
 * Erros possíveis:
 * - propaga erros de acesso ao banco.
 *
 * Efeitos colaterais:
 * - leitura em `WhatsAppInboundEvent`.
 */
export async function shouldThrottleTenantInbound(input: {
  ownerId: string
  senderPhone: string
  now?: Date
}): Promise<boolean> {
  const now = input.now ?? new Date()
  const lowerBound = new Date(now.getTime() - 60_000)

  const count = await prisma.whatsAppInboundEvent.count({
    where: {
      ownerId: input.ownerId,
      senderPhone: normalizeInboundPhone(input.senderPhone),
      createdAt: { gte: lowerBound },
    },
  })

  return count >= 5
}

/**
 * Objetivo: decidir resposta operacional para mensagem inbound e persistir rastreabilidade ponta-a-ponta.
 *
 * Entradas:
 * - senderPhone (string), messageBody (string) e providerMessageId (string opcional).
 *
 * Validações:
 * - requer texto não vazio e vínculo com contrato ativo.
 * - impede duplicação via `dedupeKey` único.
 * - aplica throttling por telefone/owner.
 *
 * Saída:
 * - objeto com flags (`handled`, `duplicate`, `throttled`) e `reply` para WhatsApp.
 *
 * Erros possíveis:
 * - propaga falhas de banco não previstas.
 * - conflitos de unicidade são tratados como duplicado seguro.
 *
 * Efeitos colaterais:
 * - INSERT em `WhatsAppInboundEvent`.
 * - INSERT em `WhatsAppMessage` (direction `Inbound`).
 * - UPDATE em `Invoice` (estado `AwaitingConfirmation` para intents de pagamento).
 * - INSERT opcional em `MaintenanceTicket` + `TicketEvent` quando detectar problema.
 * - INSERT em `AuditLog` para rastreabilidade.
 */
export async function processTenantInboundMessage(input: {
  senderPhone: string
  messageBody: string
  providerMessageId?: string
}) {
  const senderPhone = normalizeInboundPhone(input.senderPhone)
  const messageBody = input.messageBody.trim()

  if (!senderPhone || !messageBody) {
    return { handled: false, duplicate: false, throttled: false, reply: 'Mensagem inválida.' }
  }

  const context = await resolveTenantContextByPhone(senderPhone)
  if (!context) {
    return {
      handled: false,
      duplicate: false,
      throttled: false,
      reply: 'Nao encontramos contrato ativo para este numero. Contacte o senhorio para atualizar o telefone.',
    }
  }

  if (await shouldThrottleTenantInbound({ ownerId: context.ownerId, senderPhone })) {
    return {
      handled: true,
      duplicate: false,
      throttled: true,
      reply: 'Recebemos varias mensagens em sequencia. Aguarde 1 minuto e tente novamente.',
    }
  }

  const intent = parseTenantIntent(messageBody)
  const dedupeKey = computeInboundDedupeKey({
    senderPhone,
    messageBody,
    providerMessageId: input.providerMessageId,
  })

  try {
    const result = await prisma.$transaction(async (tx) => {
      const inbound = await tx.whatsAppInboundEvent.create({
        data: {
          ownerId: context.ownerId,
          renterId: context.renterId,
          leaseId: context.leaseId,
          invoiceId: context.activeInvoiceId,
          senderPhone,
          messageBody,
          intent,
          dedupeKey,
          providerMessageId: input.providerMessageId ?? null,
        },
      })

      await tx.whatsAppMessage.create({
        data: {
          ownerId: context.ownerId,
          renterId: context.renterId,
          invoiceId: context.activeInvoiceId,
          direction: 'Inbound',
          messageType: 'Text',
          providerMsgId: input.providerMessageId ?? null,
          fromPhone: senderPhone,
          body: messageBody,
          status: 'Received',
          providerPayload: {
            intent,
            dedupeKey,
          },
          readAt: new Date(),
        },
      })

      let reply = 'Mensagem recebida. Vamos analisar e responder em breve.'

      if ((intent === 'tenant_claimed_paid' || intent === 'tenant_promised_tomorrow') && context.activeInvoiceId) {
        await tx.invoice.update({
          where: { id: context.activeInvoiceId },
          data: { status: 'AwaitingConfirmation' },
        })

        reply =
          intent === 'tenant_claimed_paid'
            ? 'Obrigado. Marcamos a cobranca como aguardando confirmacao do senhorio.'
            : 'Registamos a previsao de pagamento para amanha e o senhorio ira acompanhar a confirmacao.'
      }

      if (intent === 'tenant_problem_reported') {
        const ticket = await tx.maintenanceTicket.create({
          data: {
            ownerId: context.ownerId,
            propertyId: context.propertyId,
            unitId: context.unitId,
            leaseId: context.leaseId,
            renterId: context.renterId,
            title: 'Problema reportado via WhatsApp',
            description: messageBody,
            priority: 'High',
            status: 'New',
            currentEventAt: new Date(),
          },
        })

        await tx.ticketEvent.create({
          data: {
            ownerId: context.ownerId,
            ticketId: ticket.id,
            type: 'InboundWhatsAppProblem',
            toStatus: 'New',
            note: 'Ticket criado automaticamente por mensagem inbound.',
            payload: {
              inboundEventId: inbound.id,
              senderPhone,
              intent,
            },
          },
        })

        reply = 'Recebemos o problema e abrimos um ticket para acompanhamento do senhorio.'
      }

      return { inbound, reply }
    })

    await logAuditEvent({
      ownerId: context.ownerId,
      action: 'WHATSAPP_INBOUND_PROCESSED',
      entityType: 'WhatsAppInboundEvent',
      entityId: result.inbound.id,
      metadata: {
        renterId: context.renterId,
        leaseId: context.leaseId,
        invoiceId: context.activeInvoiceId,
        intent,
        dedupeKey,
      },
    })

    return {
      handled: true,
      duplicate: false,
      throttled: false,
      reply: result.reply,
      intent,
    }
  } catch (error) {
    const prismaKnownCode =
      typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : ''

    if (prismaKnownCode === 'P2002') {
      return {
        handled: true,
        duplicate: true,
        throttled: false,
        reply: 'Mensagem ja recebida anteriormente. Seguimos com o processamento original.',
      }
    }

    throw error
  }
}
