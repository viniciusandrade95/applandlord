import { prisma } from '@/lib/prisma'
import { sendTextMessage } from '@/lib/whatsapp'
import {
  renderWhatsAppTemplate,
  resolveReminderTemplateName,
  type WhatsAppTemplateName,
} from '@/lib/whatsapp-templates'

const MAX_REMINDER_ATTEMPTS = 3
const RETRY_DELAY_MINUTES = 15

type ReminderWithRelations = Awaited<ReturnType<typeof getReminderWithRelations>>

function normalizePhoneNumber(phone: string) {
  return phone.replace(/\D/g, '')
}

async function getReminderWithRelations(reminderId: string) {
  return prisma.reminder.findUnique({
    where: { id: reminderId },
    include: {
      invoice: {
        include: {
          lease: {
            include: {
              renter: true,
              property: true,
              unit: true,
            },
          },
        },
      },
    },
  })
}

function assertReminderReady(reminder: NonNullable<ReminderWithRelations>) {
  if (!reminder.invoice) {
    throw new Error('Reminder invoice reference is missing')
  }

  const renter = reminder.invoice.lease.renter
  if (!renter.phone) {
    throw new Error('The renter does not have a phone number configured')
  }

  const phone = normalizePhoneNumber(renter.phone)
  if (!phone) {
    throw new Error('The renter phone number is invalid for WhatsApp delivery')
  }

  return {
    renter,
    invoice: reminder.invoice,
    phone,
  }
}

export async function createReminderForInvoice(input: {
  ownerId: string
  invoiceId: string
  scheduledFor?: Date
  templateName?: WhatsAppTemplateName
  trigger: 'daily_job' | 'manual_collect_now'
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: input.invoiceId, ownerId: input.ownerId },
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
    throw new Error('Invoice not found')
  }

  const templateName =
    input.templateName ?? resolveReminderTemplateName(invoice.dueDate, input.scheduledFor ?? new Date())

  return prisma.reminder.create({
    data: {
      ownerId: input.ownerId,
      leaseId: invoice.leaseId,
      invoiceId: invoice.id,
      channel: 'WHATSAPP',
      status: 'Pending',
      scheduledFor: input.scheduledFor ?? new Date(),
      payload: {
        templateName,
        trigger: input.trigger,
      },
    },
  })
}

export async function dispatchReminder(reminderId: string) {
  const reminder = await getReminderWithRelations(reminderId)

  if (!reminder) {
    throw new Error('Reminder not found')
  }

  const attemptNumber = reminder.attempts + 1

  try {
    const { invoice, renter, phone } = assertReminderReady(reminder)
    const payloadTemplateName =
      typeof reminder.payload === 'object' && reminder.payload && 'templateName' in reminder.payload
        ? String((reminder.payload as { templateName?: unknown }).templateName)
        : ''
    const templateName =
      payloadTemplateName === 'rent_reminder_due' ||
      payloadTemplateName === 'rent_overdue_notice' ||
      payloadTemplateName === 'rent_manual_collect_now' ||
      payloadTemplateName === 'payment_confirmation'
        ? (payloadTemplateName as WhatsAppTemplateName)
        : resolveReminderTemplateName(invoice.dueDate)

    const messageBody = renderWhatsAppTemplate(templateName, {
      renterName: renter.fullName,
      invoiceId: invoice.id,
      amount: invoice.amount,
      dueDate: invoice.dueDate,
      propertyName: invoice.lease.property.name,
      unitName: invoice.lease.unit.name,
    })

    const messageLog = await prisma.whatsAppMessage.create({
      data: {
        ownerId: reminder.ownerId,
        renterId: renter.id,
        invoiceId: invoice.id,
        reminderId: reminder.id,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        templateName,
        toPhone: phone,
        body: messageBody,
        status: 'Queued',
        providerPayload: {
          request: {
            channel: 'WHATSAPP',
            to: phone,
            templateName,
            body: messageBody,
          },
        },
      },
    })

    console.info('Dispatching WhatsApp reminder', {
      reminderId: reminder.id,
      invoiceId: invoice.id,
      attemptNumber,
      templateName,
    })

    const providerResponse = await sendTextMessage(phone, messageBody)
    const providerMessageId = providerResponse?.messages?.[0]?.id ?? null

    await prisma.$transaction([
      prisma.whatsAppMessage.update({
        where: { id: messageLog.id },
        data: {
          status: 'Sent',
          providerMsgId: providerMessageId,
          sentAt: new Date(),
          failureReason: null,
          providerPayload: {
            request: {
              channel: 'WHATSAPP',
              to: phone,
              templateName,
              body: messageBody,
            },
            response: providerResponse,
          },
        },
      }),
      prisma.reminder.update({
        where: { id: reminder.id },
        data: {
          status: 'Sent',
          attempts: attemptNumber,
          sentAt: new Date(),
          failureReason: null,
          externalRef: providerMessageId,
        },
      }),
    ])

    return {
      success: true,
      reminderId: reminder.id,
      attemptNumber,
      providerMessageId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to dispatch reminder'
    const nextStatus = attemptNumber >= MAX_REMINDER_ATTEMPTS ? 'Failed' : 'RetryScheduled'
    const nextSchedule =
      nextStatus === 'RetryScheduled' ? new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000) : reminder.scheduledFor

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        attempts: attemptNumber,
        status: nextStatus,
        failureReason: message,
        scheduledFor: nextSchedule,
      },
    })

    await prisma.whatsAppMessage.create({
      data: {
        ownerId: reminder.ownerId,
        renterId: reminder.invoice?.lease.renter.id,
        invoiceId: reminder.invoiceId,
        reminderId: reminder.id,
        direction: 'OUTBOUND',
        messageType: 'TEMPLATE',
        templateName:
          typeof reminder.payload === 'object' && reminder.payload && 'templateName' in reminder.payload
            ? String((reminder.payload as { templateName?: unknown }).templateName)
            : null,
        status: 'Failed',
        failureReason: message,
        providerPayload: {
          error: message,
          attemptNumber,
        },
      },
    })

    console.error('Failed to dispatch WhatsApp reminder', {
      reminderId,
      attemptNumber,
      status: nextStatus,
      error: message,
    })

    return {
      success: false,
      reminderId: reminder.id,
      attemptNumber,
      error: message,
      status: nextStatus,
    }
  }
}

function dayStart(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function dayEnd(date: Date) {
  const result = dayStart(date)
  result.setDate(result.getDate() + 1)
  return result
}

export async function runDailyReminderJob(referenceDate = new Date()) {
  const start = dayStart(referenceDate)
  const end = dayEnd(referenceDate)

  const dueInvoices = await prisma.invoice.findMany({
    where: {
      status: { not: 'Paid' },
      dueDate: { lte: end },
    },
    select: {
      id: true,
      ownerId: true,
    },
  })

  let created = 0
  for (const invoice of dueInvoices) {
    const alreadyScheduled = await prisma.reminder.findFirst({
      where: {
        ownerId: invoice.ownerId,
        invoiceId: invoice.id,
        scheduledFor: { gte: start, lt: end },
        channel: 'WHATSAPP',
      },
      select: { id: true },
    })

    if (alreadyScheduled) {
      continue
    }

    await createReminderForInvoice({
      ownerId: invoice.ownerId,
      invoiceId: invoice.id,
      scheduledFor: referenceDate,
      trigger: 'daily_job',
    })
    created += 1
  }

  const remindersToDispatch = await prisma.reminder.findMany({
    where: {
      channel: 'WHATSAPP',
      status: { in: ['Pending', 'RetryScheduled'] },
      scheduledFor: { lte: new Date() },
      attempts: { lt: MAX_REMINDER_ATTEMPTS },
    },
    orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
    take: 100,
    select: { id: true },
  })

  let sent = 0
  let failed = 0

  for (const reminder of remindersToDispatch) {
    const result = await dispatchReminder(reminder.id)
    if (result.success) {
      sent += 1
    } else {
      failed += 1
    }
  }

  console.info('Daily reminder job finished', {
    referenceDate: referenceDate.toISOString(),
    dueInvoices: dueInvoices.length,
    remindersCreated: created,
    remindersProcessed: remindersToDispatch.length,
    sent,
    failed,
  })

  return {
    referenceDate: referenceDate.toISOString(),
    dueInvoices: dueInvoices.length,
    remindersCreated: created,
    remindersProcessed: remindersToDispatch.length,
    sent,
    failed,
  }
}
