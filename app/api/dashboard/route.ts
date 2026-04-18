import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'
import { buildDashboardAttentionModel } from '@/lib/dashboard-attention'

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
      dueTodayInvoices,
      urgentMaintenance,
      expiringLeasesIn7Days,
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

      prisma.invoice.count({
        where: {
          ownerId: userId,
          status: { not: 'Paid' },
          dueDate: {
            gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)),
            lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)),
          },
        },
      }),
      prisma.maintenanceTicket.count({
        where: {
          ownerId: userId,
          status: { not: 'Resolved' },
          priority: { in: ['Urgent', 'High'] },
        },
      }),
      prisma.lease.count({
        where: {
          ownerId: userId,
          status: 'Active',
          endDate: {
            gte: now,
            lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 7, 23, 59, 59)),
          },
        },
      }),
    ])

    const confirmedAmount = Number(monthlyConfirmedPayments._sum.amount ?? 0)
    const expensesAmount = Number(monthlyExpenses._sum.amount ?? 0)
    const openInvoicesAmount = Number(openInvoices._sum.amount ?? 0)
    const vacantUnits = Math.max(0, units - occupiedUnits)

    const counts = {
      properties,
      units,
      occupiedUnits,
      vacantUnits,
      renters,
      leases,
      activeLeases,
      overdueInvoices,
      openMaintenance,
    }

    const finances = {
      monthlyConfirmedPayments: confirmedAmount,
      monthlyExpenses: expensesAmount,
      monthlyNetProfit: confirmedAmount - expensesAmount,
      openInvoices: openInvoicesAmount,
      awaitingConfirmation,
      collectionRate: openInvoicesAmount > 0 ? Math.round((confirmedAmount / openInvoicesAmount) * 100) : 0,
    }

    const attention = buildDashboardAttentionModel({
      counts,
      finances,
      dueTodayInvoices,
      urgentMaintenance,
      expiringLeasesIn7Days,
    })

    return NextResponse.json({
      counts,
      finances,
      attention,
      recentPayments,
      recentInvoices,
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
