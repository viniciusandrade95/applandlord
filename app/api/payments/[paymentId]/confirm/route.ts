import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'

type RouteContext = {
  params: Promise<{
    paymentId: string
  }>
}

/**
 * Objetivo: confirmar manualmente um pagamento pendente e concluir cobrança.
 *
 * Contrato de entrada:
 * - Path: `paymentId` obrigatório.
 * - Body JSON opcional: `{ note?: string }`.
 * - Sessão autenticada obrigatória.
 *
 * Contrato de saída:
 * - 200: `{ paymentId, invoiceId, invoiceStatus, paymentStatus, confirmedAt, note }`.
 * - 400: pagamento já confirmado ou inválido.
 * - 401: não autenticado.
 * - 404: pagamento/cobrança não encontrados no owner.
 * - 500: erro interno.
 *
 * Autorização:
 * - apenas owner do pagamento pode confirmar.
 *
 * Efeitos colaterais:
 * - UPDATE em `Payment` (`confirmationStatus`, `confirmedAt`, `confirmedByUserId`).
 * - UPDATE em `Invoice` (`status`, `paidAt`, `paymentMethod`).
 * - INSERT em `AuditLog`.
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { paymentId } = await context.params
    const safePaymentId = asString(paymentId)

    if (!safePaymentId) {
      return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const note = asString(body?.note) || null

    const payment = await prisma.payment.findFirst({
      where: { id: safePaymentId, ownerId: userId },
      include: { invoice: true },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    if (payment.confirmationStatus === 'Confirmed') {
      return NextResponse.json({ error: 'Payment already confirmed' }, { status: 400 })
    }

    const totals = await prisma.payment.aggregate({
      where: {
        ownerId: userId,
        invoiceId: payment.invoiceId,
        confirmationStatus: 'Confirmed',
      },
      _sum: { amount: true },
    })

    const alreadyConfirmed = Number(totals._sum.amount ?? 0)
    const totalAfterConfirmation = alreadyConfirmed + Number(payment.amount)

    const invoiceStatus = totalAfterConfirmation >= Number(payment.invoice.amount) ? 'Paid' : 'Partial'

    const result = await prisma.$transaction(async (tx) => {
      const confirmedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: {
          confirmationStatus: 'Confirmed',
          confirmedAt: new Date(),
          confirmedByUserId: userId,
        },
      })

      const updatedInvoice = await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: invoiceStatus,
          paidAt: confirmedPayment.paidAt,
          paymentMethod: confirmedPayment.method,
        },
      })

      return { confirmedPayment, updatedInvoice }
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'PAYMENT_CONFIRMED',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        invoiceId: payment.invoiceId,
        invoiceStatus,
        note,
        confirmedAmount: payment.amount,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({
      paymentId: result.confirmedPayment.id,
      invoiceId: result.updatedInvoice.id,
      invoiceStatus: result.updatedInvoice.status,
      paymentStatus: result.confirmedPayment.confirmationStatus,
      confirmedAt: result.confirmedPayment.confirmedAt?.toISOString() ?? null,
      note,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 })
  }
}
