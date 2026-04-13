import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const payments = await prisma.payment.findMany({
      include: {
        tenant: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(payments)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch payments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const payment = await prisma.payment.create({
      data: {
        tenantId: body.tenantId,
        amount: Number(body.amount),
        dueDate: new Date(body.dueDate),
        paidDate: body.paidDate ? new Date(body.paidDate) : null,
        status: body.status ?? 'Pending',
      },
    })

    return NextResponse.json(payment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create payment' }, { status: 500 })
  }
}
