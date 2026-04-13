import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'

export async function GET() {
  try {
    const properties = await prisma.property.findMany({
      include: {
        units: {
          orderBy: { createdAt: 'desc' },
        },
        leases: {
          include: {
            renter: true,
            unit: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(properties)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = asString(body.name)
    const addressLine1 = asString(body.addressLine1)
    const city = asString(body.city)
    const region = asString(body.region)
    const postalCode = asString(body.postalCode)

    if (!name || !addressLine1 || !city || !region || !postalCode) {
      return NextResponse.json(
        { error: 'name, addressLine1, city, region and postalCode are required' },
        { status: 400 }
      )
    }

    const property = await prisma.property.create({
      data: {
        name,
        addressLine1,
        addressLine2: asString(body.addressLine2) || null,
        city,
        region,
        postalCode,
        country: asString(body.country, 'Portugal'),
        description: asString(body.description) || null,
      },
    })

    return NextResponse.json(property, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
}
