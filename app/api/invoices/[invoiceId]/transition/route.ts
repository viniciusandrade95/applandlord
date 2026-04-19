import { NextResponse } from 'next/server'
import { requireCurrentUserId } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { assertRentChargeTransitionAllowed } from '@/lib/rent-state-machine'
import { logAuditEvent } from '@/lib/audit'

type RouteContext = {
  params: Promise<{
    invoiceId: string
  }>
}

/**
 * Objetivo: efetuar transição segura de estado de cobrança com trilha completa de logs.
 *
 * Contrato de entrada:
 * - Path param: `invoiceId` (string obrigatório).
 * - Body JSON: `{ toStatus: string, note?: string }`.
 * - Headers: cookie de sessão obrigatório (via `requireCurrentUserId`).
 *
 * Contrato de saída:
 * - 200: `{ invoiceId, previousStatus, currentStatus, transitionLogId, transitionedAt, note }`.
 * - 400: payload inválido, estado inválido ou transição proibida.
 * - 401: sem autenticação.
 * - 404: cobrança inexistente no owner autenticado.
 * - 500: erro interno inesperado.
 *
 * Autorização:
 * - owner somente altera cobranças com `ownerId = userId`.
 *
 * Efeitos colaterais:
 * - UPDATE em `rent_charges.status`.
 * - INSERT em `RentChargeTransitionLog`.
 * - INSERT em `AuditLog`.
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { invoiceId } = await context.params
    const safeInvoiceId = asString(invoiceId)

    if (!safeInvoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const toStatus = asString(body?.toStatus)
    const note = asString(body?.note) || null

    if (!toStatus) {
      return NextResponse.json({ error: 'toStatus is required' }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: safeInvoiceId, ownerId: userId },
      select: { id: true, ownerId: true, status: true },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const { normalizedFrom, normalizedTo } = assertRentChargeTransitionAllowed({
      fromStatus: invoice.status,
      toStatus,
      note,
    })

    const transition = await prisma.$transaction(async (tx) => {
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: normalizedTo },
        select: { id: true, status: true, updatedAt: true },
      })

      const transitionLog = await tx.rentChargeTransitionLog.create({
        data: {
          ownerId: userId,
          invoiceId: invoice.id,
          previousStatus: normalizedFrom,
          newStatus: normalizedTo,
          note,
          triggeredByUserId: userId,
        },
        select: { id: true, createdAt: true },
      })

      return {
        updatedInvoice,
        transitionLog,
      }
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'RENT_CHARGE_STATUS_TRANSITIONED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: {
        previousStatus: normalizedFrom,
        newStatus: normalizedTo,
        note,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({
      invoiceId: transition.updatedInvoice.id,
      previousStatus: normalizedFrom,
      currentStatus: transition.updatedInvoice.status,
      transitionLogId: transition.transitionLog.id,
      transitionedAt: transition.transitionLog.createdAt.toISOString(),
      note,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to transition invoice status'
    const status = message.includes('Invalid') || message.includes('same status') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
