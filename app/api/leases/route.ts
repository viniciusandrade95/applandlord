import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString } from '@/lib/landlord'

export async function GET() {
  try {
    const leases = await prisma.lease.findMany({
      include: {
        property: true,
        unit: true,
        renter: true,
        invoices: {
          orderBy: {
            dueDate: 'desc',
          },
          take: 12,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(leases)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch leases' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const propertyId = asString(body.propertyId)
    const unitId = asString(body.unitId)
    const renterId = asString(body.renterId)
    const startDate = asDate(body.startDate)
    const monthlyRent = asNumber(body.monthlyRent)

    if (!propertyId || !unitId || !renterId || monthlyRent <= 0) {
      return NextResponse.json(
        { error: 'propertyId, unitId, renterId and monthlyRent are required' },
        { status: 400 }
      )
    }

    const [property, unit, renter] = await Promise.all([
      prisma.property.findUnique({ where: { id: propertyId } }),
      prisma.unit.findUnique({ where: { id: unitId } }),
      prisma.renter.findUnique({ where: { id: renterId } }),
    ])

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    if (!unit) {
      return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
    }

    if (unit.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Unit does not belong to the selected property' }, { status: 400 })
    }

    if (!renter) {
      return NextResponse.json({ error: 'Renter not found' }, { status: 404 })
    }

    const lease = await prisma.lease.create({
      data: {
        propertyId,
        unitId,
        renterId,
        startDate,
        endDate: body.endDate ? asDate(body.endDate) : null,
        monthlyRent,
        depositAmount: asNumber(body.depositAmount),
        dueDay: Math.max(1, Math.min(28, Number(body.dueDay) || 1)),
        status: asString(body.status, 'Active'),
        notes: asString(body.notes) || null,
      },
      include: {
        property: true,
        unit: true,
        renter: true,
      },
    })

    const isActiveLease = lease.status === 'Active'

    await prisma.unit.update({
      where: { id: unitId },
      data: {
        status: isActiveLease ? 'Occupied' : 'Vacant',
      },
    })

    return NextResponse.json(lease, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create lease' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const leaseId = asString(body.leaseId)

    if (!leaseId) {
      return NextResponse.json({ error: 'leaseId is required' }, { status: 400 })
    }

    const lease = await prisma.lease.findUnique({
      where: { id: leaseId },
      include: { unit: true },
    })

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 })
    }

    const updatedLease = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        status: asString(body.status, 'Ended'),
        endDate: body.endDate ? asDate(body.endDate) : new Date(),
        notes: body.notes !== undefined ? asString(body.notes) : lease.notes,
      },
      include: {
        property: true,
        unit: true,
        renter: true,
      },
    })

    const activeLeaseCount = await prisma.lease.count({
      where: {
        unitId: lease.unitId,
        status: 'Active',
      },
    })

    if (activeLeaseCount === 0) {
      await prisma.unit.update({
        where: { id: lease.unitId },
        data: { status: 'Vacant' },
      })
    }

    return NextResponse.json(updatedLease)
  } catch {
    return NextResponse.json({ error: 'Failed to update lease' }, { status: 500 })
  }
}
