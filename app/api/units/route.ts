import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asNumber, asString } from '@/lib/landlord'

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      include: {
        property: true,
        leases: {
          include: {
            renter: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(units)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const propertyId = asString(body.propertyId)
    const name = asString(body.name)
    const monthlyRent = asNumber(body.monthlyRent)

    if (!propertyId || !name || monthlyRent <= 0) {
      return NextResponse.json(
        { error: 'propertyId, name and monthlyRent are required' },
        { status: 400 }
      )
    }

    const property = await prisma.property.findUnique({ where: { id: propertyId } })
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const unit = await prisma.unit.create({
      data: {
        propertyId,
        name,
        bedrooms: Number.isFinite(Number(body.bedrooms)) ? Number(body.bedrooms) : 0,
        bathrooms: asNumber(body.bathrooms),
        floor: asString(body.floor) || null,
        areaSqm: body.areaSqm === '' || body.areaSqm === null || body.areaSqm === undefined ? null : asNumber(body.areaSqm),
        monthlyRent,
        status: asString(body.status, 'Vacant'),
        notes: asString(body.notes) || null,
      },
    })

    return NextResponse.json(unit, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create unit' }, { status: 500 })
  }
}
