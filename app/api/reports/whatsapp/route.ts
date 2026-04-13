import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'

export async function POST() {
  try {
    const totalTenants = await prisma.tenant.count()
    const overdue = await prisma.tenant.count({ where: { paymentStatus: 'Overdue' } })

    const apartments = await prisma.apartment.findMany({ where: { status: 'Occupied' } })

    const monthlyIncome = apartments.reduce((sum, a) => sum + Number(a.rentAmount), 0)

    const report = `🏢 Relatório do Senhorio\n\n👥 Inquilinos: ${totalTenants}\n⚠️ Em atraso: ${overdue}\n💰 Renda mensal: €${monthlyIncome}`

    const landlordPhone = process.env.LANDLORD_PHONE

    if (!landlordPhone) {
      return NextResponse.json({ error: 'Missing LANDLORD_PHONE' }, { status: 400 })
    }

    await sendTextMessage(landlordPhone, report)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
