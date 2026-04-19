import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'

/**
 * Objetivo: listar despesas do owner com filtros opcionais por imóvel/contrato.
 *
 * Entrada:
 * - Query params opcionais: propertyId, leaseId.
 * - Sessão autenticada.
 *
 * Saída:
 * - 200 com array de despesas.
 * - 401 não autenticado.
 * - 500 erro interno.
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const url = new URL(request.url)
    const propertyId = asString(url.searchParams.get('propertyId')) || undefined
    const leaseId = asString(url.searchParams.get('leaseId')) || undefined

    const expenses = await prisma.expense.findMany({
      where: {
        ownerId: userId,
        ...(propertyId ? { propertyId } : {}),
        ...(leaseId ? { leaseId } : {}),
      },
      include: {
        property: true,
        unit: true,
        lease: {
          include: {
            renter: true,
            property: true,
            unit: true,
          },
        },
        invoice: true,
      },
      orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(expenses)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

/**
 * Objetivo: criar despesa financeira vinculada a imóvel e/ou contrato.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const category = asString(body.category)
    const amount = asNumber(body.amount)

    if (!category) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be greater than zero' }, { status: 400 })
    }

    const propertyId = asString(body.propertyId) || null
    const unitId = asString(body.unitId) || null
    const leaseId = asString(body.leaseId) || null

    if (!propertyId && !leaseId) {
      return NextResponse.json({ error: 'propertyId or leaseId is required' }, { status: 400 })
    }

    if (propertyId) {
      const property = await prisma.property.findFirst({ where: { id: propertyId, ownerId: userId }, select: { id: true } })
      if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (unitId) {
      const unit = await prisma.unit.findFirst({ where: { id: unitId, ownerId: userId }, select: { id: true } })
      if (!unit) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    if (leaseId) {
      const lease = await prisma.lease.findFirst({ where: { id: leaseId, ownerId: userId }, select: { id: true } })
      if (!lease) return NextResponse.json({ error: 'Lease not found' }, { status: 404 })
    }

    const expense = await prisma.expense.create({
      data: {
        ownerId: userId,
        propertyId,
        unitId,
        leaseId,
        invoiceId: asString(body.invoiceId) || null,
        category,
        description: asString(body.description) || null,
        amount,
        incurredAt: body.incurredAt ? asDate(body.incurredAt) : new Date(),
      },
      include: {
        property: true,
        unit: true,
        lease: {
          include: {
            renter: true,
            property: true,
            unit: true,
          },
        },
        invoice: true,
      },
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'EXPENSE_CREATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount: expense.amount,
        propertyId: expense.propertyId,
        leaseId: expense.leaseId,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(expense, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
