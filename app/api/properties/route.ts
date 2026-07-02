import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { pageResult, parsePageParams } from '@/lib/pagination'

/**
 * GET /api/properties?take=24&cursor=<id>&q=<texto>
 * Lista paginada de imóveis (com unidades) ordenada por morada.
 * `take` pode ir a 500 para alimentar selects de formulários (até o combobox assíncrono chegar).
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { take, cursor, q } = parsePageParams(request.url, { take: 24, maxTake: 500 })

    const where: Record<string, unknown> = { ownerId: userId }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { addressLine1: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [rows, total] = await Promise.all([
      prisma.property.findMany({
        where,
        include: {
          units: {
            where: { ownerId: userId },
            orderBy: { createdAt: 'desc' },
          },
        },
        orderBy: [{ addressLine1: 'asc' }, { id: 'asc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.property.count({ where }),
    ])

    return NextResponse.json(pageResult(rows, take, total))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
        ownerId: userId,
        name,
        addressLine1,
        addressLine2: asString(body.addressLine2) || null,
        city,
        region,
        postalCode,
        country: asString(body.country, 'Brasil'),
        description: asString(body.description) || null,
      },
    })

    return NextResponse.json(property, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const id = asString(body.id)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.property.findFirst({ where: { id, ownerId: userId } })
    if (!existing) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

    const name = asString(body.name, existing.name)
    const addressLine1 = asString(body.addressLine1, existing.addressLine1)
    const city = asString(body.city, existing.city)
    const region = asString(body.region, existing.region)
    const postalCode = asString(body.postalCode, existing.postalCode)

    if (!name || !addressLine1 || !city || !region || !postalCode) {
      return NextResponse.json(
        { error: 'name, addressLine1, city, region and postalCode are required' },
        { status: 400 }
      )
    }

    const property = await prisma.property.update({
      where: { id },
      data: {
        name,
        addressLine1,
        addressLine2: body.addressLine2 === undefined ? existing.addressLine2 : asString(body.addressLine2) || null,
        city,
        region,
        postalCode,
        country: asString(body.country, existing.country),
        description: body.description === undefined ? existing.description : asString(body.description) || null,
      },
    })

    return NextResponse.json(property)
  } catch {
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 })
  }
}
