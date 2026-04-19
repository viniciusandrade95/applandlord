import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { validatePaymentDraft } from '@/lib/finance'

/**
 * Objetivo: listar pagamentos do owner autenticado com contexto completo de contrato/cobrança.
 *
 * Contrato de entrada:
 * - sem body/query.
 * - requer cookie de sessão válido.
 *
 * Contrato de saída:
 * - 200: Payment[] com invoice/lease/property/unit/renter.
 * - 401: não autenticado.
 * - 500: erro interno.
 */
export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const payments = await prisma.payment.findMany({
      where: { ownerId: userId },
      include: {
        invoice: {
          include: {
            lease: {
              include: {
                property: true,
                unit: true,
                renter: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(payments)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

/**
 * Objetivo: registar pagamento com comprovativo opcional e colocar cobrança em awaiting_confirmation.
 *
 * Contrato de entrada:
 * - body JSON:
 *   - invoiceId (string, obrigatório)
 *   - amount (number/string, opcional; default valor da cobrança)
 *   - method (string, opcional; default "Bank transfer")
 *   - paidAt (ISO date, opcional)
 *   - receiptUrl (string URL http/https, opcional)
 *   - reference, notes (string, opcionais)
 *
 * Contrato de saída:
 * - 201: Payment criado com `confirmationStatus=AwaitingConfirmation`.
 * - 400: payload inválido.
 * - 401: não autenticado.
 * - 404: cobrança não encontrada no owner.
 * - 500: erro interno.
 *
 * Efeitos colaterais:
 * - INSERT em `Payment`.
 * - UPDATE em `Invoice` para status `AwaitingConfirmation`.
 * - INSERT em `AuditLog`.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const invoiceId = asString(body.invoiceId)

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, ownerId: userId },
      include: {
        lease: {
          include: {
            property: true,
            unit: true,
            renter: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const draft = validatePaymentDraft({
      amount: body.amount,
      invoiceAmount: invoice.amount,
      method: body.method,
      receiptUrl: body.receiptUrl,
      reference: body.reference,
      notes: body.notes,
    })

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          ownerId: userId,
          invoiceId,
          amount: draft.amount,
          paidAt: body.paidAt ? asDate(body.paidAt) : new Date(),
          method: draft.method,
          receiptUrl: draft.receiptUrl,
          confirmationStatus: 'AwaitingConfirmation',
          reference: draft.reference,
          notes: draft.notes,
        },
        include: {
          invoice: {
            include: {
              lease: {
                include: {
                  property: true,
                  unit: true,
                  renter: true,
                },
              },
            },
          },
        },
      })

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'AwaitingConfirmation',
          paymentMethod: created.method,
        },
      })

      return created
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'PAYMENT_REGISTERED',
      entityType: 'Payment',
      entityId: payment.id,
      metadata: {
        invoiceId,
        paymentAmount: payment.amount,
        invoiceAmount: invoice.amount,
        paymentMethod: payment.method,
        confirmationStatus: payment.confirmationStatus,
        receiptUrl: payment.receiptUrl,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create payment'
    const status = message.includes('must') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
