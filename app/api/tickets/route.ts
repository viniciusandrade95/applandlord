import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { normalizeTicketPriority, normalizeTicketStatus } from '@/lib/ticket-state-machine'

function normalizeFilter(values: string[] | undefined, allowed: readonly string[]) {
  const filtered = (values ?? []).map((value) => String(value).trim()).filter((value) => allowed.includes(value))
  return filtered.length > 0 ? filtered : undefined
}

/**
 * Objetivo: listar tickets do owner com filtros úteis de prioridade e estado.
 * Entrada: query opcional `priority` e `status` (multi-valor).
 * Saída: 200 com array de tickets e timeline embutida (eventos mais recentes primeiro).
 * Erros: 401 sem sessão; 500 falha inesperada.
 * Efeitos colaterais: apenas leitura de banco.
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const { searchParams } = new URL(request.url)
    const statuses = normalizeFilter(searchParams.getAll('status'), ['New', 'Triaged', 'Waiting', 'Resolved', 'Closed'])
    const priorities = normalizeFilter(searchParams.getAll('priority'), ['Low', 'Normal', 'High', 'Urgent'])

    const tickets = await prisma.maintenanceTicket.findMany({
      where: {
        ownerId: userId,
        ...(statuses ? { status: { in: statuses } } : {}),
        ...(priorities ? { priority: { in: priorities } } : {}),
      },
      include: {
        property: true,
        unit: true,
        lease: {
          include: {
            renter: true,
          },
        },
        renter: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    })

    return NextResponse.json(tickets)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 })
  }
}

/**
 * Objetivo: criar ticket operacional formalmente rastreável.
 * Entrada: body JSON com `title`, vínculos opcionais (`propertyId`, `unitId`, `leaseId`, `renterId`), `priority`, `status` e `description`.
 * Saída: 201 com ticket criado e evento inicial (`TicketCreated`).
 * Erros: 400 por validação; 401 sem sessão; 404 quando vínculos não pertencem ao owner; 500 inesperado.
 * Efeitos colaterais: escrita em `MaintenanceTicket` e `TicketEvent`.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const body = await request.json()
    const title = asString(body.title)

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const propertyId = asString(body.propertyId) || null
    const unitId = asString(body.unitId) || null
    const leaseId = asString(body.leaseId) || null
    const renterId = asString(body.renterId) || null

    const [property, unit, lease, renter] = await Promise.all([
      propertyId ? prisma.property.findFirst({ where: { id: propertyId, ownerId: userId } }) : Promise.resolve(null),
      unitId ? prisma.unit.findFirst({ where: { id: unitId, ownerId: userId } }) : Promise.resolve(null),
      leaseId ? prisma.lease.findFirst({ where: { id: leaseId, ownerId: userId } }) : Promise.resolve(null),
      renterId ? prisma.renter.findFirst({ where: { id: renterId, ownerId: userId } }) : Promise.resolve(null),
    ])

    if (propertyId && !property) return NextResponse.json({ error: 'propertyId not found for owner' }, { status: 404 })
    if (unitId && !unit) return NextResponse.json({ error: 'unitId not found for owner' }, { status: 404 })
    if (leaseId && !lease) return NextResponse.json({ error: 'leaseId not found for owner' }, { status: 404 })
    if (renterId && !renter) return NextResponse.json({ error: 'renterId not found for owner' }, { status: 404 })

    if (lease && propertyId && lease.propertyId !== propertyId) {
      return NextResponse.json({ error: 'Lease does not belong to informed propertyId' }, { status: 400 })
    }

    if (lease && unitId && lease.unitId !== unitId) {
      return NextResponse.json({ error: 'Lease does not belong to informed unitId' }, { status: 400 })
    }

    if (lease && renterId && lease.renterId !== renterId) {
      return NextResponse.json({ error: 'Lease does not belong to informed renterId' }, { status: 400 })
    }

    const status = normalizeTicketStatus(body.status, 'New')
    const priority = normalizeTicketPriority(body.priority, 'Normal')
    const now = new Date()

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        ownerId: userId,
        title,
        description: asString(body.description) || null,
        priority,
        status,
        propertyId: propertyId ?? lease?.propertyId ?? unit?.propertyId ?? null,
        unitId: unitId ?? lease?.unitId ?? null,
        leaseId,
        renterId: renterId ?? lease?.renterId ?? null,
        currentEventAt: now,
        triagedAt: status === 'Triaged' ? now : null,
        waitingAt: status === 'Waiting' ? now : null,
        resolvedAt: status === 'Resolved' ? now : null,
        closedAt: status === 'Closed' ? now : null,
      },
      include: {
        property: true,
        unit: true,
        lease: { include: { renter: true } },
        renter: true,
      },
    })

    await prisma.ticketEvent.create({
      data: {
        ownerId: userId,
        ticketId: ticket.id,
        type: 'TicketCreated',
        toStatus: status,
        note: asString(body.creationNote) || 'Ticket criado no painel.',
        payload: {
          priority,
          propertyId: ticket.propertyId,
          unitId: ticket.unitId,
          leaseId: ticket.leaseId,
          renterId: ticket.renterId,
        },
        createdById: userId,
      },
    })

    return NextResponse.json(ticket, { status: 201 })
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid ticket priority') || error.message.includes('Invalid ticket status'))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 })
  }
}
