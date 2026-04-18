import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'

export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const now = new Date()
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))

    const [
      properties,
      units,
      renters,
      leases,
      activeLeases,
      overdueInvoices,
      openMaintenance,
      monthlyPayments,
      openInvoices,
      recentPayments,
      recentInvoices,
      occupiedUnits,
    ] = await Promise.all([
      prisma.property.count({ where: { ownerId: userId } }),
      prisma.unit.count({ where: { ownerId: userId } }),
      prisma.renter.count({ where: { ownerId: userId } }),
      prisma.lease.count({ where: { ownerId: userId } }),
      prisma.lease.count({ where: { ownerId: userId, status: 'Active' } }),
      prisma.invoice.count({
        where: {
          ownerId: userId,
          status: { not: 'Paid' },
          dueDate: { lt: now },
        },
      }),
      prisma.maintenanceTicket.count({
        where: {
          ownerId: userId,
          status: { not: 'Resolved' },
        },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          ownerId: userId,
          paidAt: { gte: monthStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          ownerId: userId,
          status: { not: 'Paid' },
        },
      }),
      prisma.payment.findMany({
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
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.invoice.findMany({
        where: { ownerId: userId },
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
        orderBy: { dueDate: 'desc' },
        take: 8,
      }),
      prisma.unit.count({ where: { ownerId: userId, status: 'Occupied' } }),
    ])

    const vacantUnits = Math.max(0, units - occupiedUnits)

    return NextResponse.json({
      counts: {
        properties,
        units,
        occupiedUnits,
        vacantUnits,
        renters,
        leases,
        activeLeases,
        overdueInvoices,
        openMaintenance,
      },
      finances: {
        monthlyPayments: monthlyPayments._sum.amount ?? 0,
        openInvoices: openInvoices._sum.amount ?? 0,
        collectionRate:
          openInvoices._sum.amount && openInvoices._sum.amount > 0
            ? Math.round((Number(monthlyPayments._sum.amount ?? 0) / Number(openInvoices._sum.amount)) * 100)
            : 0,
      },
      recentPayments,
      recentInvoices,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
