import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'

export async function getInvoiceForWhatsApp(invoiceId: string) {
  return prisma.invoice.findUnique({
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
}

export function normalizePhoneNumber(phone: string) {
  return phone.replace(/\D/g, '')
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDueDate(value: Date) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

export function buildInvoiceWhatsAppMessage(invoice: NonNullable<Awaited<ReturnType<typeof getInvoiceForWhatsApp>>>) {
  return (
    `Ola ${invoice.lease.renter.fullName}, a sua fatura ${invoice.id} ` +
    `no valor de ${formatCurrency(invoice.amount)} vence em ${formatDueDate(invoice.dueDate)}. ` +
    `Imovel: ${invoice.lease.property.name}. Unidade: ${invoice.lease.unit.name}.`
  )
}

export async function sendInvoiceWhatsApp(invoiceId: string, renterId?: string) {
  const invoice = await getInvoiceForWhatsApp(invoiceId)

  if (!invoice) {
    throw new Error('Invoice not found')
  }

  if (renterId && invoice.lease.renter.id !== renterId) {
    throw new Error('Invoice does not belong to the provided tenantId')
  }

  if (!invoice.lease.renter.phone) {
    throw new Error('The renter does not have a phone number configured')
  }

  const phone = normalizePhoneNumber(invoice.lease.renter.phone)
  if (!phone) {
    throw new Error('The renter phone number is invalid for WhatsApp delivery')
  }

  const message = buildInvoiceWhatsAppMessage(invoice)
  const result = await sendTextMessage(phone, message)

  return {
    invoice,
    phone,
    result,
  }
}
