import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asNumber, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { pageResult, parsePageParams } from '@/lib/pagination'

/** GET /api/units?take=&cursor= — lista paginada (com imóvel) para listas e selects. */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { take, cursor } = parsePageParams(request.url, { take: 24, maxTake: 500 })
    const where = { ownerId: userId }

    const [rows, total] = await Promise.all([
      prisma.unit.findMany({
        where,
        include: { property: true },
        orderBy: [{ property: { addressLine1: 'asc' } }, { id: 'asc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.unit.count({ where }),
    ])

    return NextResponse.json(pageResult(rows, take, total))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    const property = await prisma.property.findFirst({ where: { id: propertyId, ownerId: userId } })
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    }

    const unit = await prisma.unit.create({
      data: {
        ownerId: userId,
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

export async function PATCH(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const id = asString(body.id)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.unit.findFirst({ where: { id, ownerId: userId } })
    if (!existing) return NextResponse.json({ error: 'Unit not found' }, { status: 404 })

    const name = asString(body.name, existing.name)
    const monthlyRent = body.monthlyRent === undefined ? existing.monthlyRent : asNumber(body.monthlyRent, existing.monthlyRent)

    if (!name || !Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return NextResponse.json({ error: 'name and a positive monthlyRent are required' }, { status: 400 })
    }

    const unit = await prisma.unit.update({
      where: { id },
      data: {
        name,
        monthlyRent,
        status: asString(body.status, existing.status),
        bedrooms: body.bedrooms === undefined || body.bedrooms === '' ? existing.bedrooms : Math.trunc(asNumber(body.bedrooms, existing.bedrooms)),
        bathrooms: body.bathrooms === undefined || body.bathrooms === '' ? existing.bathrooms : asNumber(body.bathrooms, existing.bathrooms),
        notes: body.notes === undefined ? existing.notes : asString(body.notes) || null,
      },
    })

    return NextResponse.json(unit)
  } catch {
    return NextResponse.json({ error: 'Failed to update unit' }, { status: 500 })
  }
}
