import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'

function normalizePhoneNumber(phone: string) {
  return phone.replace(/\D/g, '')
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

function formatDueDate(value: Date) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const tenantId = typeof body?.tenantId === 'string' ? body.tenantId.trim() : ''
    const invoiceId = typeof body?.invoiceId === 'string' ? body.invoiceId.trim() : ''

    if (!tenantId || !invoiceId) {
      return NextResponse.json(
        { success: false, error: 'tenantId and invoiceId are required' },
        { status: 400 }
      )
    }

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lease: {
          include: {
            renter: true,
            property: true,
            unit: true,
          },
        },
      },
    })

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 })
    }

    if (invoice.lease.renter.id !== tenantId) {
      return NextResponse.json(
        { success: false, error: 'Invoice does not belong to the provided tenantId' },
        { status: 404 }
      )
    }

    const renter = invoice.lease.renter
    if (!renter.phone) {
      return NextResponse.json(
        { success: false, error: 'The renter does not have a phone number configured' },
        { status: 400 }
      )
    }

    const phone = normalizePhoneNumber(renter.phone)
    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'The renter phone number is invalid for WhatsApp delivery' },
        { status: 400 }
      )
    }

    const message =
      `Ola ${renter.fullName}, a sua fatura ${invoice.id} ` +
      `no valor de ${formatCurrency(invoice.amount)} vence em ${formatDueDate(invoice.dueDate)}. ` +
      `Imovel: ${invoice.lease.property.name}. Unidade: ${invoice.lease.unit.name}.`

    console.info('Sending invoice via WhatsApp', {
      invoiceId: invoice.id,
      renterId: renter.id,
    })

    await sendTextMessage(phone, message)

    return NextResponse.json({
      success: true,
      detail: 'Mensagem enviada.',
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to send invoice via WhatsApp'

    console.error('Failed to send invoice via WhatsApp', { error: message })

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    )
  }
}
