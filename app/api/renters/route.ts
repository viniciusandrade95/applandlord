import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { pageResult, parsePageParams } from '@/lib/pagination'

/** GET /api/renters?take=&cursor=&q= — lista paginada, sem relações pesadas. */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { take, cursor, q } = parsePageParams(request.url, { take: 24, maxTake: 500 })

    const where: Record<string, unknown> = { ownerId: userId }
    if (q) where.fullName = { contains: q, mode: 'insensitive' }

    const [rows, total] = await Promise.all([
      prisma.renter.findMany({
        where,
        orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      }),
      prisma.renter.count({ where }),
    ])

    return NextResponse.json(pageResult(rows, take, total))
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

export async function PATCH(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const id = asString(body.id)
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

    const existing = await prisma.renter.findFirst({ where: { id, ownerId: userId } })
    if (!existing) return NextResponse.json({ error: 'Renter not found' }, { status: 404 })

    const fullName = asString(body.fullName, existing.fullName)
    if (!fullName) return NextResponse.json({ error: 'fullName is required' }, { status: 400 })

    const renter = await prisma.renter.update({
      where: { id },
      data: {
        fullName,
        email: body.email === undefined ? existing.email : asString(body.email) || null,
        phone: body.phone === undefined ? existing.phone : asString(body.phone) || null,
        governmentId: body.governmentId === undefined ? existing.governmentId : asString(body.governmentId) || null,
        notes: body.notes === undefined ? existing.notes : asString(body.notes) || null,
      },
    })

    return NextResponse.json(renter)
  } catch {
    return NextResponse.json({ error: 'Failed to update renter' }, { status: 500 })
  }
}
