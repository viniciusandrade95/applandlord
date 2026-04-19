import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const renters = await prisma.renter.findMany({
      where: { ownerId: userId },
      include: {
        leases: {
          where: { ownerId: userId },
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
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const fullName = asString(body.fullName)

    if (!fullName) {
      return NextResponse.json({ error: 'fullName is required' }, { status: 400 })
    }

    const renter = await prisma.renter.create({
      data: {
        ownerId: userId,
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
