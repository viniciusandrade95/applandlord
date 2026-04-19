import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import {
  assertTicketTransitionAllowed,
  normalizeTicketPriority,
  ticketTransitionTimestamps,
} from '@/lib/ticket-state-machine'

/**
 * Objetivo: atualizar ticket com gestão formal de estado/prioridade e rastreabilidade de evento.
 * Entrada: `ticketId` na rota + body JSON opcional (`status`, `priority`, `title`, `description`, vínculos e `note`).
 * Saída: 200 com ticket atualizado + relacionamentos.
 * Erros: 400 validação; 401 sem sessão; 404 ticket/vínculos inexistentes; 500 inesperado.
 * Efeitos colaterais: atualiza `MaintenanceTicket` e cria `TicketEvent`.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ticketId } = await params

  try {
    const body = await request.json()
    const ticket = await prisma.maintenanceTicket.findFirst({
      where: { id: ticketId, ownerId: userId },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const nextPriority = body.priority !== undefined ? normalizeTicketPriority(body.priority) : ticket.priority

    let nextStatus = ticket.status
    let transition: ReturnType<typeof ticketTransitionTimestamps> | null = null

    if (body.status !== undefined) {
      const normalizedTransition = assertTicketTransitionAllowed({ fromStatus: ticket.status, toStatus: body.status })
      nextStatus = normalizedTransition.normalizedTo
      transition = ticketTransitionTimestamps({ fromStatus: ticket.status, toStatus: nextStatus })
    }

    const propertyId = body.propertyId !== undefined ? asString(body.propertyId) || null : ticket.propertyId
    const unitId = body.unitId !== undefined ? asString(body.unitId) || null : ticket.unitId
    const leaseId = body.leaseId !== undefined ? asString(body.leaseId) || null : ticket.leaseId
    const renterId = body.renterId !== undefined ? asString(body.renterId) || null : ticket.renterId

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

    const updated = await prisma.maintenanceTicket.update({
      where: { id: ticketId },
      data: {
        title: body.title !== undefined ? asString(body.title) : ticket.title,
        description: body.description !== undefined ? asString(body.description) || null : ticket.description,
        priority: nextPriority,
        status: nextStatus,
        propertyId: propertyId ?? lease?.propertyId ?? unit?.propertyId ?? null,
        unitId: unitId ?? lease?.unitId ?? null,
        leaseId,
        renterId: renterId ?? lease?.renterId ?? null,
        currentEventAt: transition?.patch.currentEventAt ?? ticket.currentEventAt,
        triagedAt: transition?.patch.triagedAt ?? ticket.triagedAt,
        waitingAt: transition?.patch.waitingAt ?? ticket.waitingAt,
        resolvedAt: transition?.patch.resolvedAt ?? ticket.resolvedAt,
        closedAt: transition?.patch.closedAt ?? ticket.closedAt,
      },
      include: {
        property: true,
        unit: true,
        lease: { include: { renter: true } },
        renter: true,
        events: {
          orderBy: { createdAt: 'desc' },
          take: 12,
        },
      },
    })

    await prisma.ticketEvent.create({
      data: {
        ownerId: userId,
        ticketId,
        type: transition ? 'StatusChanged' : 'TicketUpdated',
        fromStatus: transition?.normalizedFrom,
        toStatus: transition?.normalizedTo,
        note: asString(body.note) || null,
        payload: {
          priority: nextPriority,
          propertyId: updated.propertyId,
          unitId: updated.unitId,
          leaseId: updated.leaseId,
          renterId: updated.renterId,
        },
        createdById: userId,
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Invalid ticket transition') ||
        error.message.includes('same ticket status') ||
        error.message.includes('Invalid ticket priority'))
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
  }
}
