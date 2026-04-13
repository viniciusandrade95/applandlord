import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'

export async function GET() {
  try {
    const tickets = await prisma.maintenanceTicket.findMany({
      include: {
        property: true,
        unit: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(tickets)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch maintenance tickets' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const title = asString(body.title)

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        title,
        description: asString(body.description) || null,
        priority: asString(body.priority, 'Normal'),
        status: asString(body.status, 'Open'),
        propertyId: asString(body.propertyId) || null,
        unitId: asString(body.unitId) || null,
      },
      include: {
        property: true,
        unit: true,
      },
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create maintenance ticket' }, { status: 500 })
  }
}
