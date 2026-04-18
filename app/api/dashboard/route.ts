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
      monthlyConfirmedPayments,
      monthlyExpenses,
      openInvoices,
      awaitingConfirmation,
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
          confirmationStatus: 'Confirmed',
        },
      }),
      prisma.expense.aggregate({
        _sum: { amount: true },
        where: {
          ownerId: userId,
          incurredAt: { gte: monthStart },
        },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: {
          ownerId: userId,
          status: { not: 'Paid' },
        },
      }),
      prisma.payment.count({ where: { ownerId: userId, confirmationStatus: 'AwaitingConfirmation' } }),
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

    const confirmedAmount = Number(monthlyConfirmedPayments._sum.amount ?? 0)
    const expensesAmount = Number(monthlyExpenses._sum.amount ?? 0)
    const openInvoicesAmount = Number(openInvoices._sum.amount ?? 0)
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
        monthlyConfirmedPayments: confirmedAmount,
        monthlyExpenses: expensesAmount,
        monthlyNetProfit: confirmedAmount - expensesAmount,
        openInvoices: openInvoicesAmount,
        awaitingConfirmation,
        collectionRate: openInvoicesAmount > 0 ? Math.round((confirmedAmount / openInvoicesAmount) * 100) : 0,
      },
      recentPayments,
      recentInvoices,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
