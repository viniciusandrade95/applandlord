import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [totalTenants, overdueTenants, apartments, totalApartments, occupiedApartments] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { paymentStatus: 'Overdue' } }),
      prisma.apartment.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.apartment.count(),
      prisma.apartment.count({ where: { status: 'Occupied' } }),
    ])

    const totalOutstandingBalance = await prisma.tenant.aggregate({
      _sum: {
        balance: true,
      },
    })

    const monthlyExpectedRent = apartments
      .filter((apartment) => apartment.status === 'Occupied')
      .reduce((sum, apartment) => sum + Number(apartment.rentAmount), 0)

    const occupancyRate = totalApartments === 0 ? 0 : Math.round((occupiedApartments / totalApartments) * 100)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      activeTenants: totalTenants,
      overdueTenants,
      totalOutstandingBalance: Number(totalOutstandingBalance._sum.balance || 0),
      monthlyExpectedRent,
      totalApartments,
      occupiedApartments,
      occupancyRate,
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate report summary' }, { status: 500 })
  }
}
