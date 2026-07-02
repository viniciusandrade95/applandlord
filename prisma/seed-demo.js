const { PrismaClient } = require('@prisma/client')
const { randomBytes, scryptSync } = require('crypto')

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
      property: { name: 'Casa da Rua das Flores', addressLine1: 'Rua das Flores, 12, 3.º Esq.', city: 'Porto', region: 'Porto', postalCode: '4000-123' },
      unit: { bedrooms: 2, bathrooms: 1, areaSqm: 78, monthlyRent: 650 },
      renter: { fullName: 'Carla Mendes', email: 'carla.mendes@example.com', phone: '+351912345678', governmentId: '124876330' },
      lease: { startDate: new Date('2023-06-01T00:00:00Z'), endDate: new Date('2027-05-31T00:00:00Z'), monthlyRent: 650, depositAmount: 1300, dueDay: 8 },
      currentPaid: true,
    },
    {
      property: { name: 'Apartamento Avenida Central', addressLine1: 'Av. Central, 45, 5.º Dto.', city: 'Lisboa', region: 'Lisboa', postalCode: '1000-200' },
      unit: { bedrooms: 1, bathrooms: 1, areaSqm: 55, monthlyRent: 820 },
      renter: { fullName: 'João Pereira', email: 'joao.pereira@example.com', phone: '+351934567890', governmentId: '208114552' },
      lease: { startDate: new Date('2023-09-15T00:00:00Z'), endDate: new Date('2026-09-14T00:00:00Z'), monthlyRent: 820, depositAmount: 1640, dueDay: 1 },
      currentPaid: false,
    },
  ]

  const summary = []

  for (const apt of apartments) {
    const property = await prisma.property.create({ data: { ownerId, country: 'Portugal', ...apt.property } })
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
    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, category: 'Condomínio', description: 'Quota mensal do condomínio', amount: apt.property.city === 'Porto' ? 45 : 60, incurredAt: dueDate(monthBack(0).period, 3) } })
    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, category: apt.property.city === 'Porto' ? 'IMI' : 'Seguro', description: apt.property.city === 'Porto' ? 'IMI anual' : 'Seguro de recheio', amount: apt.property.city === 'Porto' ? 120 : 90, incurredAt: dueDate(monthBack(2).period, 15) } })

    summary.push({ property: property.name, tenant: renter.fullName, rent: apt.lease.monthlyRent, currentPaid: apt.currentPaid })
  }

  // Uma avaria aberta no primeiro apartamento.
  const firstProperty = await prisma.property.findFirst({ where: { ownerId, name: 'Casa da Rua das Flores' }, include: { units: true } })
  if (firstProperty) {
    await prisma.maintenanceTicket.create({
      data: {
        ownerId,
        propertyId: firstProperty.id,
        unitId: firstProperty.units[0]?.id,
        title: 'Torneira da cozinha a pingar',
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
