import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

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

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const body = await request.json()
    const invoiceId = asString(body.invoiceId)
    const method = asString(body.method, 'Bank transfer')

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

    const payment = await prisma.payment.create({
      data: {
        ownerId: userId,
        invoiceId,
        amount: asNumber(body.amount, invoice.amount),
        paidAt: body.paidAt ? asDate(body.paidAt) : new Date(),
        method,
        reference: asString(body.reference) || null,
        notes: asString(body.notes) || null,
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

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: payment.amount >= invoice.amount ? 'Paid' : 'Partial',
        paidAt: payment.paidAt,
        paymentMethod: payment.method,
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
