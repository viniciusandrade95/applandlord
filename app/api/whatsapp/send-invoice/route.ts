import { NextResponse } from 'next/server'
import { sendInvoiceWhatsApp } from '@/lib/whatsapp-invoice'
import { requireCurrentUserId } from '@/lib/auth'

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    const result = await sendInvoiceWhatsApp(invoiceId, userId, tenantId)

    console.info('Sending invoice via WhatsApp', {
      invoiceId: result.invoice.id,
      renterId: result.invoice.lease.renter.id,
      reminderId: result.reminderId,
      providerMessageId: result.providerMessageId,
    })

    return NextResponse.json({
      success: true,
      detail: 'Mensagem enviada.',
      reminderId: result.reminderId,
      providerMessageId: result.providerMessageId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send invoice via WhatsApp'
    const status =
      message === 'Invoice not found' || message === 'Invoice does not belong to the provided tenantId'
        ? 404
        : message.includes('phone')
          ? 400
          : 500

    console.error('Failed to send invoice via WhatsApp', { error: message })

    return NextResponse.json({ success: false, error: message }, { status })
  }
}
