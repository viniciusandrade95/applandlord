import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        apartment: true,
        payments: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(tenants)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch tenants' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const tenant = await prisma.tenant.create({
      data: {
        fullName: body.fullName,
        phone: body.phone,
        email: body.email,
        leaseStart: new Date(body.leaseStart),
        leaseEnd: body.leaseEnd ? new Date(body.leaseEnd) : null,
        paymentStatus: body.paymentStatus ?? 'Paid',
        balance: Number(body.balance ?? 0),
        apartmentId: body.apartmentId,
      },
    })

    return NextResponse.json(tenant, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create tenant' }, { status: 500 })
  }
}
