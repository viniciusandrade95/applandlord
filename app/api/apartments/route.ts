import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const apartments = await prisma.apartment.findMany({
      include: {
        tenants: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(apartments)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch apartments' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const apartment = await prisma.apartment.create({
      data: {
        name: body.name,
        address: body.address,
        rentAmount: Number(body.rentAmount),
        status: body.status ?? 'Vacant',
        beds: Number(body.beds),
        baths: Number(body.baths),
      },
    })

    return NextResponse.json(apartment, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create apartment' }, { status: 500 })
  }
}
