const { PrismaClient } = require('@prisma/client')
const { randomBytes, scryptSync } = require('crypto')

// Carrega o .env local se DATABASE_URL não estiver no ambiente (para `node prisma/seed-demo.js` funcionar).
if (!process.env.DATABASE_URL) {
  try {
    const fs = require('fs')
    const path = require('path')
    const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    for (const line of envFile.split('\n')) {
      const match = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  } catch {
    // sem .env — assume que DATABASE_URL vem do ambiente
  }
}

const prisma = new PrismaClient()

// Mesmo algoritmo de lib/auth.hashPassword (scrypt salt:hash), para definir a password demo.
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

// Período "YYYY-MM" com `offset` meses para trás a partir do mês atual (UTC).
function monthBack(offset) {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
  const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return { period, year: d.getUTCFullYear(), monthIndex: d.getUTCMonth() }
}

function dueDate(period, day) {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0))
}

async function main() {
  const ownerEmail = 'adilson@teste.com'
  const passwordHash = hashPassword('password123!')

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { name: 'Adilson', passwordHash },
    create: { email: ownerEmail, name: 'Adilson', passwordHash },
  })
  const ownerId = owner.id

  // Limpar tudo do owner para um estado demo reproduzível.
  await prisma.ticketEvent.deleteMany({ where: { ownerId } })
  await prisma.maintenanceTicket.deleteMany({ where: { ownerId } })
  await prisma.payment.deleteMany({ where: { ownerId } })
  await prisma.whatsAppInboundEvent.deleteMany({ where: { ownerId } }).catch(() => {})
  await prisma.whatsAppMessage.deleteMany({ where: { ownerId } }).catch(() => {})
  await prisma.reminder.deleteMany({ where: { ownerId } }).catch(() => {})
  await prisma.expense.deleteMany({ where: { ownerId } })
  await prisma.rentChargeTransitionLog.deleteMany({ where: { ownerId } }).catch(() => {})
  await prisma.invoice.deleteMany({ where: { ownerId } })
  await prisma.lease.deleteMany({ where: { ownerId } })
  await prisma.unit.deleteMany({ where: { ownerId } })
  await prisma.property.deleteMany({ where: { ownerId } })
  await prisma.renter.deleteMany({ where: { ownerId } })
  await prisma.auditLog.deleteMany({ where: { ownerId } }).catch(() => {})

  // Dois apartamentos (imóvel = apartamento), inquilinos, contratos com ~3 anos.
  const apartments = [
    {
      property: { name: 'Apto Jardins', addressLine1: 'Rua Oscar Freire, 1200, Apto 45', city: 'São Paulo', region: 'SP', postalCode: '01426-001' },
      unit: { bedrooms: 2, bathrooms: 1, areaSqm: 78, monthlyRent: 3200 },
      renter: { fullName: 'Carla Mendes', email: 'carla.mendes@example.com', phone: '+55 11 91234-5678', governmentId: '123.456.789-00' },
      lease: { startDate: new Date('2023-06-01T00:00:00Z'), endDate: new Date('2027-05-31T00:00:00Z'), monthlyRent: 3200, depositAmount: 6400, dueDay: 8 },
      currentPaid: true,
    },
    {
      property: { name: 'Av. Atlântica, 500, Apto 802', addressLine1: 'Av. Atlântica, 500, Apto 802', city: 'Rio de Janeiro', region: 'RJ', postalCode: '22021-001' },
      unit: { bedrooms: 1, bathrooms: 1, areaSqm: 55, monthlyRent: 4100 },
      renter: { fullName: 'João Pereira', email: 'joao.pereira@example.com', phone: '+55 21 99876-5432', governmentId: '987.654.321-00' },
      lease: { startDate: new Date('2023-09-15T00:00:00Z'), endDate: new Date('2026-09-14T00:00:00Z'), monthlyRent: 4100, depositAmount: 8200, dueDay: 1 },
      currentPaid: false,
    },
  ]

  const summary = []

  for (const apt of apartments) {
    const property = await prisma.property.create({ data: { ownerId, country: 'Brasil', ...apt.property } })
    const unit = await prisma.unit.create({ data: { ownerId, propertyId: property.id, name: apt.property.name, status: 'Occupied', ...apt.unit } })
    const renter = await prisma.renter.create({ data: { ownerId, ...apt.renter } })
    const lease = await prisma.lease.create({
      data: { ownerId, propertyId: property.id, unitId: unit.id, renterId: renter.id, status: 'Active', ...apt.lease },
    })

    // Faturas dos últimos 4 meses. Os 3 mais antigos pagos; o atual conforme currentPaid.
    for (let offset = 3; offset >= 0; offset -= 1) {
      const { period } = monthBack(offset)
      const isCurrent = offset === 0
      const paid = isCurrent ? apt.currentPaid : true
      const invoice = await prisma.invoice.create({
        data: {
          ownerId,
          leaseId: lease.id,
          period,
          dueDate: dueDate(period, apt.lease.dueDay),
          amount: apt.lease.monthlyRent,
          status: paid ? 'Paid' : 'Pending',
          paidAt: paid ? dueDate(period, apt.lease.dueDay) : null,
        },
      })
      if (paid) {
        await prisma.payment.create({
          data: {
            ownerId,
            invoiceId: invoice.id,
            amount: apt.lease.monthlyRent,
            method: 'Bank transfer',
            reference: `DEMO-${period}`,
            confirmationStatus: 'Confirmed',
            confirmedAt: dueDate(period, apt.lease.dueDay),
            confirmedByUserId: ownerId,
            paidAt: dueDate(period, apt.lease.dueDay),
          },
        })
      }
    }

    // Duas despesas por apartamento.
    const isSaoPaulo = apt.property.city === 'São Paulo'
    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, category: 'Condomínio', description: 'Taxa mensal do condomínio', amount: isSaoPaulo ? 650 : 780, incurredAt: dueDate(monthBack(0).period, 3) } })
    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, category: isSaoPaulo ? 'IPTU' : 'Seguro', description: isSaoPaulo ? 'IPTU (parcela)' : 'Seguro do imóvel', amount: isSaoPaulo ? 380 : 240, incurredAt: dueDate(monthBack(2).period, 15) } })

    summary.push({ property: property.name, tenant: renter.fullName, rent: apt.lease.monthlyRent, currentPaid: apt.currentPaid })
  }

  // Uma avaria aberta no primeiro apartamento.
  const firstProperty = await prisma.property.findFirst({ where: { ownerId, name: 'Apto Jardins' }, include: { units: true } })
  if (firstProperty) {
    await prisma.maintenanceTicket.create({
      data: {
        ownerId,
        propertyId: firstProperty.id,
        unitId: firstProperty.units[0]?.id,
        title: 'Torneira da cozinha vazando',
        description: 'A torneira da cozinha está a pingar; pode precisar de vedante novo.',
        priority: 'Normal',
        status: 'Triaged',
        triagedAt: new Date(),
        currentEventAt: new Date(),
      },
    })
  }

  console.log('✅ Seed demo concluído (2 apartamentos, 2 inquilinos, contratos ~3 anos).')
  console.log('Login demo: adilson@teste.com / password123!')
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error('❌ Falha ao executar seed demo')
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
