import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'
import { monthKey } from '@/lib/landlord'

/**
 * GET /api/home
 * Agregado único para a página inicial (assistente). Tudo calculado no servidor com listas
 * limitadas a top-5 + contagens — o payload é constante, independentemente de o senhorio ter
 * 2 ou 3.000 apartamentos.
 *
 * Resposta:
 * {
 *   period,
 *   month: { received, expected, paidCount, dueCount, confirmingCount },
 *   tasks: {
 *     due: [{ unitId, tenantName, rent, title }] (top 5 por valor), dueTotal,
 *     confirming: [...], confirmingTotal,
 *     endingSoon: [{ unitId, tenantName, title, days }] (próximos 60 dias, top 5), endingSoonTotal,
 *     openTickets
 *   },
 *   stats: { apartments, dueCount, openTickets }
 * }
 */
export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const period = monthKey()
    const now = new Date()
    const in60Days = new Date(now.getTime() + 60 * 86400000)

    const taskInclude = {
      unit: { select: { id: true } },
      property: { select: { addressLine1: true, name: true } },
      renter: { select: { fullName: true } },
    }
    const settledStatuses = ['Paid', 'AwaitingConfirmation']

    // "Por receber" = contrato ativo cuja fatura do período não está paga nem a confirmar
    // (inclui o caso de a fatura ainda nem existir).
    const dueWhere = {
      ownerId: userId,
      status: 'Active',
      NOT: { invoices: { some: { period, status: { in: settledStatuses } } } },
    }
    const confirmingWhere = {
      ownerId: userId,
      status: 'Active',
      invoices: { some: { period, status: 'AwaitingConfirmation' } },
    }
    const endingWhere = {
      ownerId: userId,
      status: 'Active',
      endDate: { gte: now, lte: in60Days },
    }

    const [
      unitsTotal,
      activeLeases,
      expected,
      received,
      paidCount,
      confirmingCount,
      dueLeases,
      dueTotal,
      confirmingLeases,
      endingLeases,
      endingTotal,
      openTickets,
    ] = await Promise.all([
      prisma.unit.count({ where: { ownerId: userId } }),
      prisma.lease.count({ where: { ownerId: userId, status: 'Active' } }),
      prisma.lease.aggregate({ _sum: { monthlyRent: true }, where: { ownerId: userId, status: 'Active' } }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ownerId: userId, confirmationStatus: 'Confirmed', invoice: { period } },
      }),
      prisma.invoice.count({ where: { ownerId: userId, period, status: 'Paid', lease: { status: 'Active' } } }),
      prisma.invoice.count({ where: { ownerId: userId, period, status: 'AwaitingConfirmation', lease: { status: 'Active' } } }),
      prisma.lease.findMany({ where: dueWhere, include: taskInclude, orderBy: { monthlyRent: 'desc' }, take: 5 }),
      prisma.lease.count({ where: dueWhere }),
      prisma.lease.findMany({ where: confirmingWhere, include: taskInclude, orderBy: { monthlyRent: 'desc' }, take: 5 }),
      prisma.lease.findMany({ where: endingWhere, include: taskInclude, orderBy: { endDate: 'asc' }, take: 5 }),
      prisma.lease.count({ where: endingWhere }),
      prisma.maintenanceTicket.count({ where: { ownerId: userId, status: { notIn: ['Resolved', 'Closed'] } } }),
    ])

    const toTask = (lease: (typeof dueLeases)[number]) => ({
      unitId: lease.unit?.id ?? lease.unitId,
      tenantName: lease.renter?.fullName ?? null,
      rent: Number(lease.monthlyRent ?? 0),
      title: lease.property?.addressLine1 || lease.property?.name || 'Apartamento',
    })

    const confirmingTotal = confirmingCount
    const dueCount = Math.max(0, activeLeases - paidCount - confirmingCount)

    return NextResponse.json({
      period,
      month: {
        received: Number(received._sum.amount ?? 0),
        expected: Number(expected._sum.monthlyRent ?? 0),
        paidCount,
        dueCount,
        confirmingCount,
      },
      tasks: {
        due: dueLeases.map(toTask),
        dueTotal,
        confirming: confirmingLeases.map(toTask),
        confirmingTotal,
        endingSoon: endingLeases.map((lease) => ({
          ...toTask(lease),
          days: lease.endDate ? Math.max(0, Math.ceil((lease.endDate.getTime() - now.getTime()) / 86400000)) : null,
        })),
        endingSoonTotal: endingTotal,
        openTickets,
      },
      stats: { apartments: unitsTotal, dueCount: dueTotal, openTickets },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load home' }, { status: 500 })
  }
}
