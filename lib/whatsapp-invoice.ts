import { prisma } from '@/lib/prisma'
import { createReminderForInvoice, dispatchReminder } from '@/lib/whatsapp-reminders'

export async function getInvoiceForWhatsApp(invoiceId: string, ownerId: string) {
  return prisma.invoice.findFirst({
    where: { id: invoiceId, ownerId },
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
}

export async function sendInvoiceWhatsApp(invoiceId: string, ownerId: string, renterId?: string) {
  const invoice = await getInvoiceForWhatsApp(invoiceId, ownerId)

  if (!invoice) {
    throw new Error('Invoice not found')
  }

  if (renterId && invoice.lease.renter.id !== renterId) {
    throw new Error('Invoice does not belong to the provided tenantId')
  }

  const reminder = await createReminderForInvoice({
    ownerId,
    invoiceId,
    templateName: 'rent_manual_collect_now',
    trigger: 'manual_collect_now',
  })

  const dispatchResult = await dispatchReminder(reminder.id)
  if (!dispatchResult.success) {
    throw new Error(dispatchResult.error || 'Failed to send invoice via WhatsApp')
  }

  return {
    invoice,
    reminderId: reminder.id,
    providerMessageId: dispatchResult.providerMessageId ?? null,
  }
}
