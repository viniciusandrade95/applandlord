import { prisma } from '@/lib/prisma'

/**
 * Semeia dados de demonstração para um owner: 2 apartamentos, 2 inquilinos, contratos
 * desde 2023 (~3 anos), histórico de rendas (uma por pagar este mês), despesas e uma avaria.
 * Apaga primeiro tudo o que pertence ao owner, para ser reproduzível.
 */
export async function seedDemoForOwner(ownerId: string) {
  const monthBack = (offset: number) => {
    const now = new Date()
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const dueOn = (period: string, day: number) => {
    const [y, m] = period.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, day))
  }

  // Limpar dados do owner (ordem segura para as FKs).
  await prisma.ticketEvent.deleteMany({ where: { ownerId } })
  await prisma.maintenanceTicket.deleteMany({ where: { ownerId } })
  await prisma.payment.deleteMany({ where: { ownerId } })
  await prisma.expense.deleteMany({ where: { ownerId } })
  await prisma.invoice.deleteMany({ where: { ownerId } })
  await prisma.lease.deleteMany({ where: { ownerId } })
  await prisma.unit.deleteMany({ where: { ownerId } })
  await prisma.property.deleteMany({ where: { ownerId } })
  await prisma.renter.deleteMany({ where: { ownerId } })

  const apartments = [
    {
      property: { name: 'Casa da Rua das Flores', addressLine1: 'Rua das Flores, 12, 3.º Esq.', city: 'Porto', region: 'Porto', postalCode: '4000-123' },
      unit: { bedrooms: 2, bathrooms: 1, areaSqm: 78, monthlyRent: 650 },
      renter: { fullName: 'Carla Mendes', email: 'carla.mendes@example.com', phone: '+351912345678', governmentId: '124876330' },
      lease: { startDate: new Date('2023-06-01T00:00:00Z'), endDate: new Date('2027-05-31T00:00:00Z'), monthlyRent: 650, depositAmount: 1300, dueDay: 8 },
      currentPaid: true,
      extraExpense: { category: 'IMI', description: 'IMI anual', amount: 120 },
      expense: { category: 'Condomínio', description: 'Quota mensal do condomínio', amount: 45 },
      ticket: 'Torneira da cozinha a pingar',
    },
    {
      property: { name: 'Apartamento Avenida Central', addressLine1: 'Av. Central, 45, 5.º Dto.', city: 'Lisboa', region: 'Lisboa', postalCode: '1000-200' },
      unit: { bedrooms: 1, bathrooms: 1, areaSqm: 55, monthlyRent: 820 },
      renter: { fullName: 'João Pereira', email: 'joao.pereira@example.com', phone: '+351934567890', governmentId: '208114552' },
      lease: { startDate: new Date('2023-09-15T00:00:00Z'), endDate: new Date('2026-09-14T00:00:00Z'), monthlyRent: 820, depositAmount: 1640, dueDay: 1 },
      currentPaid: false,
      extraExpense: { category: 'Seguro', description: 'Seguro de recheio', amount: 90 },
      expense: { category: 'Condomínio', description: 'Quota mensal do condomínio', amount: 60 },
      ticket: null as string | null,
    },
  ]

  for (const apt of apartments) {
    const property = await prisma.property.create({ data: { ownerId, country: 'Portugal', ...apt.property } })
    const unit = await prisma.unit.create({ data: { ownerId, propertyId: property.id, name: apt.property.name, status: 'Occupied', ...apt.unit } })
    const renter = await prisma.renter.create({ data: { ownerId, ...apt.renter } })
    const lease = await prisma.lease.create({ data: { ownerId, propertyId: property.id, unitId: unit.id, renterId: renter.id, status: 'Active', ...apt.lease } })

    for (let offset = 3; offset >= 0; offset -= 1) {
      const period = monthBack(offset)
      const paid = offset === 0 ? apt.currentPaid : true
      const invoice = await prisma.invoice.create({
        data: {
          ownerId,
          leaseId: lease.id,
          period,
          dueDate: dueOn(period, apt.lease.dueDay),
          amount: apt.lease.monthlyRent,
          status: paid ? 'Paid' : 'Pending',
          paidAt: paid ? dueOn(period, apt.lease.dueDay) : null,
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
            confirmedAt: dueOn(period, apt.lease.dueDay),
            confirmedByUserId: ownerId,
            paidAt: dueOn(period, apt.lease.dueDay),
          },
        })
      }
    }

    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, incurredAt: dueOn(monthBack(0), 3), ...apt.expense } })
    await prisma.expense.create({ data: { ownerId, propertyId: property.id, leaseId: lease.id, incurredAt: dueOn(monthBack(2), 15), ...apt.extraExpense } })

    if (apt.ticket) {
      await prisma.maintenanceTicket.create({
        data: {
          ownerId,
          propertyId: property.id,
          unitId: unit.id,
          title: apt.ticket,
          description: 'Registado a partir dos dados de demonstração.',
          priority: 'Normal',
          status: 'Triaged',
          triagedAt: new Date(),
          currentEventAt: new Date(),
        },
      })
    }
  }
}
