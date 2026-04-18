import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { dueDateForPeriod, isActiveLease, monthKey } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const body = await request.json().catch(() => ({}))
    const period = typeof body?.period === 'string' && body.period.trim() ? body.period.trim() : monthKey()

    const leases = await prisma.lease.findMany({
      where: { ownerId: userId },
      include: {
        unit: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const eligibleLeases = leases.filter((lease) => isActiveLease(lease, new Date()))
    const created: Array<{ leaseId: string; period: string; amount: number }> = []

    for (const lease of eligibleLeases) {
      const existing = await prisma.invoice.findUnique({
        where: {
          leaseId_period: {
            leaseId: lease.id,
            period,
          },
        },
      })

      if (existing) {
        continue
      }

      const invoice = await prisma.invoice.create({
        data: {
          ownerId: userId,
          leaseId: lease.id,
          period,
          dueDate: dueDateForPeriod(period, lease.dueDay),
          amount: lease.monthlyRent,
          status: 'Pending',
        },
      })

      created.push({
        leaseId: invoice.leaseId,
        period: invoice.period,
        amount: invoice.amount,
      })
    }

    return NextResponse.json({
      period,
      createdCount: created.length,
      created,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to generate invoices' }, { status: 500 })
  }
}
