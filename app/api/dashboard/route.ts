import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
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
    ] = await Promise.all([
      prisma.property.count(),
      prisma.unit.count(),
      prisma.renter.count(),
      prisma.lease.count(),
      prisma.lease.count({ where: { status: 'Active' } }),
      prisma.invoice.count({
        where: {
          status: { not: 'Paid' },
          dueDate: { lt: now },
        },
      }),
      prisma.maintenanceTicket.count({
        where: {
          status: { not: 'Resolved' },
        },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paidAt: { gte: monthStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          status: { not: 'Paid' },
        },
      }),
      prisma.payment.findMany({
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
    ])

    const occupiedUnits = await prisma.unit.count({ where: { status: 'Occupied' } })
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
