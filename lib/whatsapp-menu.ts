import { prisma } from '@/lib/prisma'
import { sendInvoiceWhatsApp } from '@/lib/whatsapp-invoice'

type MenuStep =
  | 'MAIN_MENU'
  | 'RENTERS_MENU'
  | 'PROPERTIES_MENU'
  | 'INVOICES_MENU'
  | 'CREATE_RENTER_NAME'
  | 'CREATE_RENTER_PHONE'
  | 'CREATE_PROPERTY_NAME'
  | 'CREATE_PROPERTY_ADDRESS'
  | 'CREATE_PROPERTY_CITY'
  | 'CREATE_PROPERTY_REGION'
  | 'CREATE_PROPERTY_POSTAL'
  | 'SEND_INVOICE_ID'

type SessionDraft = {
  fullName?: string
  name?: string
  addressLine1?: string
  city?: string
  region?: string
}

type MenuSession = {
  step: MenuStep
  draft: SessionDraft
  updatedAt: number
}

const SESSION_TTL_MS = 30 * 60 * 1000
const THROTTLE_MS = 1000

const globalForWhatsappMenu = globalThis as typeof globalThis & {
  whatsappMenuSessions?: Map<string, MenuSession>
  whatsappMenuThrottle?: Map<string, number>
}

function getSessionStore() {
  if (!globalForWhatsappMenu.whatsappMenuSessions) {
    globalForWhatsappMenu.whatsappMenuSessions = new Map<string, MenuSession>()
  }

  return globalForWhatsappMenu.whatsappMenuSessions
}

function getThrottleStore() {
  if (!globalForWhatsappMenu.whatsappMenuThrottle) {
    globalForWhatsappMenu.whatsappMenuThrottle = new Map<string, number>()
  }

  return globalForWhatsappMenu.whatsappMenuThrottle
}

function getSession(senderId: string) {
  const store = getSessionStore()
  const session = store.get(senderId)

  if (!session) {
    return null
  }

  if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
    store.delete(senderId)
    return null
  }

  return session
}

function setSession(senderId: string, step: MenuStep, draft: SessionDraft = {}) {
  getSessionStore().set(senderId, {
    step,
    draft,
    updatedAt: Date.now(),
  })
}

function clearSession(senderId: string) {
  getSessionStore().delete(senderId)
}

export function shouldThrottleWhatsapp(senderId: string) {
  const store = getThrottleStore()
  const now = Date.now()
  const lastSeenAt = store.get(senderId) ?? 0
  store.set(senderId, now)
  return now - lastSeenAt < THROTTLE_MS
}

function normalizeText(input: string) {
  return input.trim().toLowerCase()
}

function isMenuResetCommand(input: string) {
  const normalized = normalizeText(input)
  return ['oi', 'ola', 'menu', 'inicio', 'start'].includes(normalized)
}

function mainMenuText() {
  return [
    'Menu principal',
    '1 - Inquilinos',
    '2 - Imoveis',
    '3 - Contratos',
    '4 - Faturas',
    '0 - Sair',
  ].join('\n')
}

function rentersMenuText() {
  return [
    'Menu de inquilinos',
    '1 - Listar',
    '2 - Criar',
    '0 - Voltar',
  ].join('\n')
}

function propertiesMenuText() {
  return [
    'Menu de imoveis',
    '1 - Listar',
    '2 - Criar',
    '0 - Voltar',
  ].join('\n')
}

function invoicesMenuText() {
  return [
    'Menu de faturas',
    '1 - Listar em aberto',
    '2 - Enviar por WhatsApp',
    '0 - Voltar',
  ].join('\n')
}

async function listRenters() {
  const renters = await prisma.renter.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  if (!renters.length) {
    return 'Ainda nao existem inquilinos registados.'
  }

  return ['Ultimos inquilinos:', ...renters.map((renter, index) => `${index + 1}. ${renter.fullName}`)].join('\n')
}

async function listProperties() {
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  if (!properties.length) {
    return 'Ainda nao existem imoveis registados.'
  }

  return ['Ultimos imoveis:', ...properties.map((property, index) => `${index + 1}. ${property.name} - ${property.city}`)].join('\n')
}

async function listContracts() {
  const leases = await prisma.lease.findMany({
    include: {
      renter: true,
      unit: true,
      property: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  if (!leases.length) {
    return 'Ainda nao existem contratos registados.'
  }

  return [
    'Ultimos contratos:',
    ...leases.map((lease, index) => `${index + 1}. ${lease.renter.fullName} - ${lease.property.name} / ${lease.unit.name}`),
  ].join('\n')
}

async function listOpenInvoices() {
  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: 'Paid' },
    },
    include: {
      lease: {
        include: {
          renter: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
    take: 5,
  })

  if (!invoices.length) {
    return 'Nao existem faturas em aberto.'
  }

  return [
    'Faturas em aberto:',
    ...invoices.map(
      (invoice, index) =>
        `${index + 1}. ${invoice.id} - ${invoice.lease.renter.fullName} - ${invoice.amount.toFixed(2)} EUR`
    ),
  ].join('\n')
}

export async function handleWhatsappMenuMessage(senderId: string, text: string) {
  if (isMenuResetCommand(text)) {
    setSession(senderId, 'MAIN_MENU')
    return mainMenuText()
  }

  const session = getSession(senderId) ?? { step: 'MAIN_MENU' as MenuStep, draft: {}, updatedAt: Date.now() }
  const normalized = normalizeText(text)

  switch (session.step) {
    case 'MAIN_MENU':
      if (normalized === '1') {
        setSession(senderId, 'RENTERS_MENU')
        return rentersMenuText()
      }

      if (normalized === '2') {
        setSession(senderId, 'PROPERTIES_MENU')
        return propertiesMenuText()
      }

      if (normalized === '3') {
        setSession(senderId, 'MAIN_MENU')
        return `${await listContracts()}\n\n${mainMenuText()}`
      }

      if (normalized === '4') {
        setSession(senderId, 'INVOICES_MENU')
        return invoicesMenuText()
      }

      if (normalized === '0') {
        clearSession(senderId)
        return 'Sessao terminada. Envie "menu" quando quiser voltar.'
      }

      setSession(senderId, 'MAIN_MENU')
      return `Opcao invalida.\n\n${mainMenuText()}`

    case 'RENTERS_MENU':
      if (normalized === '1') {
        setSession(senderId, 'RENTERS_MENU')
        return `${await listRenters()}\n\n${rentersMenuText()}`
      }

      if (normalized === '2') {
        setSession(senderId, 'CREATE_RENTER_NAME')
        return 'Indique o nome completo do novo inquilino.'
      }

      if (normalized === '0') {
        setSession(senderId, 'MAIN_MENU')
        return mainMenuText()
      }

      return `Opcao invalida.\n\n${rentersMenuText()}`

    case 'CREATE_RENTER_NAME':
      setSession(senderId, 'CREATE_RENTER_PHONE', { fullName: text.trim() })
      return 'Indique o telefone do inquilino em formato internacional, ou escreva "sem".'

    case 'CREATE_RENTER_PHONE': {
      const phone = normalized === 'sem' ? null : text.trim()
      const renter = await prisma.renter.create({
        data: {
          fullName: session.draft.fullName ?? 'Novo inquilino',
          phone,
        },
      })

      setSession(senderId, 'RENTERS_MENU')
      return `Inquilino criado: ${renter.fullName}.\n\n${rentersMenuText()}`
    }

    case 'PROPERTIES_MENU':
      if (normalized === '1') {
        setSession(senderId, 'PROPERTIES_MENU')
        return `${await listProperties()}\n\n${propertiesMenuText()}`
      }

      if (normalized === '2') {
        setSession(senderId, 'CREATE_PROPERTY_NAME')
        return 'Indique o nome do imovel.'
      }

      if (normalized === '0') {
        setSession(senderId, 'MAIN_MENU')
        return mainMenuText()
      }

      return `Opcao invalida.\n\n${propertiesMenuText()}`

    case 'CREATE_PROPERTY_NAME':
      setSession(senderId, 'CREATE_PROPERTY_ADDRESS', { name: text.trim() })
      return 'Indique a morada principal do imovel.'

    case 'CREATE_PROPERTY_ADDRESS':
      setSession(senderId, 'CREATE_PROPERTY_CITY', {
        ...session.draft,
        addressLine1: text.trim(),
      })
      return 'Indique a cidade.'

    case 'CREATE_PROPERTY_CITY':
      setSession(senderId, 'CREATE_PROPERTY_REGION', {
        ...session.draft,
        city: text.trim(),
      })
      return 'Indique a regiao.'

    case 'CREATE_PROPERTY_REGION':
      setSession(senderId, 'CREATE_PROPERTY_POSTAL', {
        ...session.draft,
        region: text.trim(),
      })
      return 'Indique o codigo postal.'

    case 'CREATE_PROPERTY_POSTAL': {
      const property = await prisma.property.create({
        data: {
          name: session.draft.name ?? 'Novo imovel',
          addressLine1: session.draft.addressLine1 ?? 'Morada por definir',
          city: session.draft.city ?? 'Cidade por definir',
          region: session.draft.region ?? 'Regiao por definir',
          postalCode: text.trim(),
          country: 'Portugal',
        },
      })

      setSession(senderId, 'PROPERTIES_MENU')
      return `Imovel criado: ${property.name}.\n\n${propertiesMenuText()}`
    }

    case 'INVOICES_MENU':
      if (normalized === '1') {
        setSession(senderId, 'INVOICES_MENU')
        return `${await listOpenInvoices()}\n\n${invoicesMenuText()}`
      }

      if (normalized === '2') {
        setSession(senderId, 'SEND_INVOICE_ID')
        return 'Indique o ID da fatura que deseja enviar por WhatsApp.'
      }

      if (normalized === '0') {
        setSession(senderId, 'MAIN_MENU')
        return mainMenuText()
      }

      return `Opcao invalida.\n\n${invoicesMenuText()}`

    case 'SEND_INVOICE_ID':
      await sendInvoiceWhatsApp(text.trim())
      setSession(senderId, 'INVOICES_MENU')
      return `Fatura enviada com sucesso.\n\n${invoicesMenuText()}`

    default:
      setSession(senderId, 'MAIN_MENU')
      return mainMenuText()
  }
}
