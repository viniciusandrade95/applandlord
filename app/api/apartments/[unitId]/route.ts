import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'
import { apartmentUnitInclude, buildApartmentVMs } from '@/lib/apartments'

type RouteContext = { params: Promise<{ unitId: string }> }

/**
 * GET /api/apartments/[unitId]
 * Detalhe de um apartamento: view-model + últimos pagamentos do contrato ativo (6) +
 * despesas do imóvel (12). Tudo limitado — nunca coleções inteiras.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { unitId } = await context.params
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, ownerId: userId },
      include: apartmentUnitInclude,
    })

    if (!unit) {
      return NextResponse.json({ error: 'Apartment not found' }, { status: 404 })
    }

    const [apartment] = await buildApartmentVMs(userId, [unit])
    const leaseId = apartment.leaseId

    const [payments, expenses] = await Promise.all([
      leaseId
        ? prisma.payment.findMany({
            where: { ownerId: userId, invoice: { leaseId } },
            select: { id: true, amount: true, paidAt: true, confirmationStatus: true },
            orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
            take: 6,
          })
        : Promise.resolve([]),
      prisma.expense.findMany({
        where: { ownerId: userId, propertyId: unit.propertyId },
        select: { id: true, category: true, description: true, amount: true, incurredAt: true },
        orderBy: [{ incurredAt: 'desc' }, { createdAt: 'desc' }],
        take: 12,
      }),
    ])

    return NextResponse.json({ apartment, payments, expenses })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch apartment' }, { status: 500 })
  }
}
