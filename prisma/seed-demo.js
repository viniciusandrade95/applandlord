const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  const ownerEmail = 'demo@applandlord.local'

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {
      name: 'Demo Landlord',
      passwordHash: 'CHANGE_ME_ON_FIRST_LOGIN',
    },
    create: {
      email: ownerEmail,
      name: 'Demo Landlord',
      passwordHash: 'CHANGE_ME_ON_FIRST_LOGIN',
    },
  })

  await prisma.ticketEvent.deleteMany({ where: { ownerId: owner.id } })
  await prisma.maintenanceTicket.deleteMany({ where: { ownerId: owner.id } })
  await prisma.payment.deleteMany({ where: { ownerId: owner.id } })
  await prisma.whatsAppInboundEvent.deleteMany({ where: { ownerId: owner.id } })
  await prisma.whatsAppMessage.deleteMany({ where: { ownerId: owner.id } })
  await prisma.reminder.deleteMany({ where: { ownerId: owner.id } })
  await prisma.expense.deleteMany({ where: { ownerId: owner.id } })
  await prisma.rentChargeTransitionLog.deleteMany({ where: { ownerId: owner.id } })
  await prisma.invoice.deleteMany({ where: { ownerId: owner.id } })
  await prisma.lease.deleteMany({ where: { ownerId: owner.id } })
  await prisma.unit.deleteMany({ where: { ownerId: owner.id } })
  await prisma.property.deleteMany({ where: { ownerId: owner.id } })
  await prisma.renter.deleteMany({ where: { ownerId: owner.id } })
  await prisma.auditLog.deleteMany({ where: { ownerId: owner.id } })

  const property = await prisma.property.create({
    data: {
      ownerId: owner.id,
      name: 'Edifício Aurora',
      addressLine1: 'Rua das Flores, 120',
      city: 'Porto',
      region: 'Porto',
      postalCode: '4000-000',
      country: 'Portugal',
      description: 'Dados fictícios para demo comercial.',
    },
  })

  const [unitA, unitB] = await Promise.all([
    prisma.unit.create({
      data: {
        ownerId: owner.id,
        propertyId: property.id,
        name: 'A1',
        bedrooms: 2,
        bathrooms: 1,
        areaSqm: 78,
        monthlyRent: 950,
        status: 'Occupied',
      },
    }),
    prisma.unit.create({
      data: {
        ownerId: owner.id,
        propertyId: property.id,
        name: 'B2',
        bedrooms: 1,
        bathrooms: 1,
        areaSqm: 56,
        monthlyRent: 760,
        status: 'Vacant',
      },
    }),
  ])

  const renter = await prisma.renter.create({
    data: {
      ownerId: owner.id,
      fullName: 'Carla Mendes',
      email: 'carla.mendes@example.com',
      phone: '+351912345678',
    },
  })

  const lease = await prisma.lease.create({
    data: {
      ownerId: owner.id,
      propertyId: property.id,
      unitId: unitA.id,
      renterId: renter.id,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-12-31T00:00:00.000Z'),
      monthlyRent: 950,
      depositAmount: 1900,
      dueDay: 8,
      status: 'Active',
    },
  })

  const [invoicePaid, invoiceOverdue] = await Promise.all([
    prisma.invoice.create({
      data: {
        ownerId: owner.id,
        leaseId: lease.id,
        period: '2026-03',
        dueDate: new Date('2026-03-08T00:00:00.000Z'),
        amount: 950,
        status: 'Paid',
        paidAt: new Date('2026-03-07T14:00:00.000Z'),
      },
    }),
    prisma.invoice.create({
      data: {
        ownerId: owner.id,
        leaseId: lease.id,
        period: '2026-04',
        dueDate: new Date('2026-04-08T00:00:00.000Z'),
        amount: 950,
        status: 'Overdue',
      },
    }),
  ])

  await prisma.payment.create({
    data: {
      ownerId: owner.id,
      invoiceId: invoicePaid.id,
      amount: 950,
      method: 'Bank transfer',
      reference: 'DEMO-MAR-2026',
      confirmationStatus: 'Confirmed',
      confirmedAt: new Date('2026-03-07T18:00:00.000Z'),
      confirmedByUserId: owner.id,
    },
  })

  const reminder = await prisma.reminder.create({
    data: {
      ownerId: owner.id,
      leaseId: lease.id,
      invoiceId: invoiceOverdue.id,
      channel: 'WHATSAPP',
      status: 'Sent',
      scheduledFor: new Date('2026-04-10T09:00:00.000Z'),
      sentAt: new Date('2026-04-10T09:00:05.000Z'),
      attempts: 1,
      externalRef: 'wamid.demo.001',
      payload: { template: 'rent_overdue_notice' },
    },
  })

  await prisma.whatsAppMessage.create({
    data: {
      ownerId: owner.id,
      renterId: renter.id,
      invoiceId: invoiceOverdue.id,
      reminderId: reminder.id,
      direction: 'OUTBOUND',
      messageType: 'template',
      templateName: 'rent_overdue_notice',
      providerMsgId: 'wamid.demo.001',
      toPhone: renter.phone,
      body: 'Olá Carla, a renda de abril está em atraso. Pode confirmar pagamento?',
      status: 'Sent',
      sentAt: new Date('2026-04-10T09:00:05.000Z'),
    },
  })

  const ticket = await prisma.maintenanceTicket.create({
    data: {
      ownerId: owner.id,
      propertyId: property.id,
      unitId: unitA.id,
      leaseId: lease.id,
      renterId: renter.id,
      title: 'Infiltração na cozinha',
      description: 'Humidade no teto próximo à bancada.',
      priority: 'High',
      status: 'Triaged',
      triagedAt: new Date('2026-04-12T10:00:00.000Z'),
      currentEventAt: new Date('2026-04-12T10:00:00.000Z'),
    },
  })

  await prisma.ticketEvent.create({
    data: {
      ownerId: owner.id,
      ticketId: ticket.id,
      type: 'StatusChanged',
      fromStatus: 'New',
      toStatus: 'Triaged',
      note: 'Chamado priorizado para visita técnica.',
      createdById: owner.id,
    },
  })

  await prisma.expense.create({
    data: {
      ownerId: owner.id,
      propertyId: property.id,
      unitId: unitA.id,
      leaseId: lease.id,
      category: 'Maintenance',
      description: 'Diagnóstico de infiltração',
      amount: 120,
      incurredAt: new Date('2026-04-13T11:30:00.000Z'),
    },
  })

  console.log('✅ Seed demo concluído')
  console.log(JSON.stringify({
    ownerId: owner.id,
    propertyId: property.id,
    unitIds: [unitA.id, unitB.id],
    renterId: renter.id,
    leaseId: lease.id,
    invoices: [invoicePaid.id, invoiceOverdue.id],
    reminderId: reminder.id,
    ticketId: ticket.id,
  }, null, 2))
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
