import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'

export async function GET() {
  try {
    const renters = await prisma.renter.findMany({
      include: {
        leases: {
          include: {
            property: true,
            unit: true,
            invoices: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(renters)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch renters' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const fullName = asString(body.fullName)

    if (!fullName) {
      return NextResponse.json({ error: 'fullName is required' }, { status: 400 })
    }

    const renter = await prisma.renter.create({
      data: {
        fullName,
        email: asString(body.email) || null,
        phone: asString(body.phone) || null,
        governmentId: asString(body.governmentId) || null,
        notes: asString(body.notes) || null,
      },
    })

    return NextResponse.json(renter, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create renter' }, { status: 500 })
  }
}
