import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'

export async function POST(req: NextRequest) {
  try {
    const { tenantId, customMessage } = await req.json()

    if (!tenantId) {
      return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { apartment: true },
    })

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    const message =
      customMessage ||
      `Olá ${tenant.fullName}, lembrete de renda de €${tenant.apartment?.rentAmount}. Obrigado.`

    await sendTextMessage(tenant.phone, message)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to send reminder' },
      { status: 500 }
    )
  }
}
