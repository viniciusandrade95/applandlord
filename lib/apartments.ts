import { prisma } from '@/lib/prisma'
import { monthKey } from '@/lib/landlord'

/**
 * View-model de "apartamento" calculado no servidor: unidade + imóvel + contrato ativo +
 * estado do mês + avarias abertas. O cliente recebe isto pronto a mostrar — nunca descarrega
 * coleções inteiras nem faz cruzamentos O(n²) no browser.
 */
export type ApartmentVM = {
  unitId: string
  propertyId: string
  leaseId: string | null
  /** Identificador visível: morada (com nome da unidade quando o imóvel tem várias). */
  title: string
  /** Nome opcional (só quando difere da morada). */
  label: string
  addressLine1: string
  city: string
  postalCode: string
  tenantName: string | null
  tenantPhone: string | null
  rent: number
  monthStatus: 'paid' | 'confirming' | 'due' | 'vacant'
  leaseStart: string | null
  leaseEnd: string | null
  currentInvoiceId: string | null
  openTickets: number
}

type UnitRow = {
  id: string
  propertyId: string
  name: string
  monthlyRent: number
  property: { id: string; name: string; addressLine1: string; city: string; postalCode: string } | null
  leases: Array<{
    id: string
    startDate: Date
    endDate: Date | null
    monthlyRent: number
    renter: { fullName: string; phone: string | null } | null
  }>
}

/**
 * Constrói os VMs para uma página de unidades (3 queries auxiliares, independentes do total
 * da carteira): fatura do período atual por contrato, avarias abertas e nº de unidades por imóvel.
 */
export async function buildApartmentVMs(userId: string, units: UnitRow[]): Promise<ApartmentVM[]> {
  if (!units.length) return []

  const period = monthKey()
  const leaseIds = units.map((unit) => unit.leases[0]?.id).filter((id): id is string => Boolean(id))
  const unitIds = units.map((unit) => unit.id)
  const propertyIds = [...new Set(units.map((unit) => unit.propertyId))]

  const [invoices, unitTickets, propertyTickets, unitCounts] = await Promise.all([
    leaseIds.length
      ? prisma.invoice.findMany({
          where: {
            ownerId: userId,
            leaseId: { in: leaseIds },
            period,
            status: { notIn: ['Canceled', 'Cancelled'] },
          },
          select: { id: true, leaseId: true, status: true },
        })
      : Promise.resolve([] as Array<{ id: string; leaseId: string; status: string }>),
    prisma.maintenanceTicket.groupBy({
      by: ['unitId'],
      where: { ownerId: userId, unitId: { in: unitIds }, status: { notIn: ['Resolved', 'Closed'] } },
      _count: { _all: true },
    }),
    prisma.maintenanceTicket.groupBy({
      by: ['propertyId'],
      where: { ownerId: userId, unitId: null, propertyId: { in: propertyIds }, status: { notIn: ['Resolved', 'Closed'] } },
      _count: { _all: true },
    }),
    prisma.unit.groupBy({
      by: ['propertyId'],
      where: { ownerId: userId, propertyId: { in: propertyIds } },
      _count: { _all: true },
    }),
  ])

  const invoiceByLease = new Map(invoices.map((invoice) => [invoice.leaseId, invoice]))
  const ticketsByUnit = new Map(unitTickets.map((row) => [row.unitId as string, row._count._all]))
  const ticketsByProperty = new Map(propertyTickets.map((row) => [row.propertyId as string, row._count._all]))
  const unitsPerProperty = new Map(unitCounts.map((row) => [row.propertyId as string, row._count._all]))

  return units.map((unit) => {
    const lease = unit.leases[0] ?? null
    const invoice = lease ? invoiceByLease.get(lease.id) ?? null : null
    const monthStatus: ApartmentVM['monthStatus'] = !lease
      ? 'vacant'
      : invoice?.status === 'Paid'
        ? 'paid'
        : invoice?.status === 'AwaitingConfirmation'
          ? 'confirming'
          : 'due'

    const addressLine = unit.property?.addressLine1 || unit.name || 'Apartamento'
    const multiUnit = (unitsPerProperty.get(unit.propertyId) ?? 1) > 1
    const customName = unit.property?.name || ''

    return {
      unitId: unit.id,
      propertyId: unit.propertyId,
      leaseId: lease?.id ?? null,
      title: multiUnit ? `${addressLine} · ${unit.name}` : addressLine,
      label: customName && customName !== addressLine ? customName : '',
      addressLine1: unit.property?.addressLine1 ?? '',
      city: unit.property?.city ?? '',
      postalCode: unit.property?.postalCode ?? '',
      tenantName: lease?.renter?.fullName ?? null,
      tenantPhone: lease?.renter?.phone ?? null,
      rent: Number(lease?.monthlyRent ?? unit.monthlyRent ?? 0),
      monthStatus,
      leaseStart: lease?.startDate?.toISOString() ?? null,
      leaseEnd: lease?.endDate?.toISOString() ?? null,
      currentInvoiceId: invoice?.id ?? null,
      openTickets: (ticketsByUnit.get(unit.id) ?? 0) + (ticketsByProperty.get(unit.propertyId) ?? 0),
    }
  })
}

/** Include padrão de unidade para construir o VM (contrato ativo mais recente + inquilino). */
export const apartmentUnitInclude = {
  property: true,
  leases: {
    where: { status: 'Active' },
    include: { renter: true },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
  },
}
