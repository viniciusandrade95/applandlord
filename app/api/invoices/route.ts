import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString, dueDateForPeriod, monthKey } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import { pageResult, parsePageParams } from '@/lib/pagination'

/**
 * GET /api/invoices?take=25&cursor=<id>&status=all|overdue|open&q=<inquilino>
 * Lista paginada de cobranças (mais recentes primeiro). Resposta: { items, nextCursor, total }.
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { take, cursor, q, searchParams } = parsePageParams(request.url, { take: 25, maxTake: 100 })
    const status = searchParams.get('status')

    const where: Record<string, unknown> = { ownerId: userId }
    if (status === 'overdue') where.status = 'Overdue'
    else if (status === 'open') where.status = { notIn: ['Paid', 'Canceled', 'Cancelled'] }
    if (q) where.lease = { renter: { fullName: { contains: q, mode: 'insensitive' } } }

    const [rows, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          lease: {
            include: {
              property: true,
              unit: true,
              renter: true,
            },
          },
        },
        orderBy: [{ dueDate: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.invoice.count({ where }),
    ])

    return NextResponse.json(pageResult(rows, take, total))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const leaseId = asString(body.leaseId)
    const lease = leaseId
      ? await prisma.lease.findFirst({
          where: { id: leaseId, ownerId: userId },
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
        ownerId: userId,
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

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'RENT_CHARGE_CREATED',
      entityType: 'Invoice',
      entityId: invoice.id,
      metadata: {
        leaseId,
        period,
        amount,
        dueDate: dueDate.toISOString(),
        status: invoice.status,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(invoice, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
