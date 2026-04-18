export type WhatsAppTemplateName =
  | 'rent_reminder_due'
  | 'rent_overdue_notice'
  | 'rent_manual_collect_now'
  | 'payment_confirmation'

export type WhatsAppTemplateContext = {
  renterName: string
  invoiceId: string
  amount: number
  dueDate: Date
  propertyName: string
  unitName: string
}

export function formatTemplateCurrency(amount: number) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatTemplateDate(value: Date) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value)
}

export function resolveReminderTemplateName(dueDate: Date, referenceDate = new Date()): WhatsAppTemplateName {
  const dueAt = new Date(dueDate)
  const today = new Date(referenceDate)
  dueAt.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)

  if (dueAt.getTime() < today.getTime()) {
    return 'rent_overdue_notice'
  }

  return 'rent_reminder_due'
}

export function renderWhatsAppTemplate(templateName: WhatsAppTemplateName, context: WhatsAppTemplateContext) {
  const formattedAmount = formatTemplateCurrency(context.amount)
  const formattedDate = formatTemplateDate(context.dueDate)

  if (templateName === 'rent_overdue_notice') {
    return (
      `Olá ${context.renterName}, identificámos atraso na cobrança ${context.invoiceId}. ` +
      `Valor em aberto: ${formattedAmount}. Vencimento original: ${formattedDate}. ` +
      `Imóvel: ${context.propertyName} / ${context.unitName}.` +
      ' Responda a esta mensagem se já efetuou o pagamento.'
    )
  }

  if (templateName === 'rent_manual_collect_now') {
    return (
      `Olá ${context.renterName}, segue lembrete manual da cobrança ${context.invoiceId}. ` +
      `Valor: ${formattedAmount}. Data de vencimento: ${formattedDate}. ` +
      `Imóvel: ${context.propertyName} / ${context.unitName}.` +
      ' Obrigado.'
    )
  }

  if (templateName === 'payment_confirmation') {
    return (
      `Olá ${context.renterName}, confirmámos o pagamento da cobrança ${context.invoiceId}. ` +
      `Valor confirmado: ${formattedAmount}. Obrigado pela regularização.`
    )
  }

  return (
    `Olá ${context.renterName}, lembrete da cobrança ${context.invoiceId}. ` +
    `Valor: ${formattedAmount}. Vencimento: ${formattedDate}. ` +
    `Imóvel: ${context.propertyName} / ${context.unitName}.`
  )
}
