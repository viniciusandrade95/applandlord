import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { normalizeTicketPriority, normalizeTicketStatus } from '@/lib/ticket-state-machine'

/**
 * Objetivo: endpoint legado de manutenção mantido para compatibilidade com o painel.
 * Entrada: filtros opcionais por query (`status`, `priority`) em GET e payload de criação em POST.
 * Saída: lista de tickets ou ticket criado no formato atual do módulo de tickets.
 * Erros: 401 sem sessão; 400 validação; 500 inesperado.
 * Efeitos colaterais: leitura/escrita em MaintenanceTicket e TicketEvent.
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')

    const tickets = await prisma.maintenanceTicket.findMany({
      where: {
        ownerId: userId,
        ...(status ? { status: normalizeTicketStatus(status) } : {}),
        ...(priority ? { priority: normalizeTicketPriority(priority) } : {}),
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
      orderBy: {
        updatedAt: 'desc',
      },
    })

    return NextResponse.json(tickets)
  } catch (error) {
    if (error instanceof Error && (error.message.includes('Invalid ticket status') || error.message.includes('Invalid ticket priority'))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to fetch maintenance tickets' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  try {
    const body = await request.json()
    const title = asString(body.title)

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const status = normalizeTicketStatus(body.status, 'New')
    const priority = normalizeTicketPriority(body.priority, 'Normal')

    const ticket = await prisma.maintenanceTicket.create({
      data: {
        ownerId: userId,
        title,
        description: asString(body.description) || null,
        priority,
        status,
        propertyId: asString(body.propertyId) || null,
        unitId: asString(body.unitId) || null,
        leaseId: asString(body.leaseId) || null,
        renterId: asString(body.renterId) || null,
        currentEventAt: new Date(),
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
        note: 'Ticket criado via endpoint legado /api/maintenance.',
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
    if (error instanceof Error && (error.message.includes('Invalid ticket status') || error.message.includes('Invalid ticket priority'))) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to create maintenance ticket' }, { status: 500 })
  }
}
