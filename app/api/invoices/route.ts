import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString, dueDateForPeriod, monthKey } from '@/lib/landlord'

export async function GET() {
  try {
    const invoices = await prisma.invoice.findMany({
      include: {
        lease: {
          include: {
            property: true,
            unit: true,
            renter: true,
          },
        },
        payments: true,
      },
      orderBy: {
        dueDate: 'desc',
      },
    })

    return NextResponse.json(invoices)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const leaseId = asString(body.leaseId)
    const lease = leaseId
      ? await prisma.lease.findUnique({
          where: { id: leaseId },
          include: { unit: true, property: true, renter: true },
        })
      : null

    if (!lease) {
      return NextResponse.json({ error: 'leaseId is required and must exist' }, { status: 400 })
    }

    const period = asString(body.period, monthKey())
    const amount = asNumber(body.amount, lease.monthlyRent)
    const dueDate = body.dueDate ? asDate(body.dueDate) : dueDateForPeriod(period, lease.dueDay)

    const invoice = await prisma.invoice.create({
      data: {
        leaseId,
        period,
        dueDate,
        amount,
        status: asString(body.status, 'Pending'),
        notes: asString(body.notes) || null,
      },
      include: {
        lease: {
          include: {
            property: true,
            unit: true,
            renter: true,
          },
        },
        payments: true,
      },
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
