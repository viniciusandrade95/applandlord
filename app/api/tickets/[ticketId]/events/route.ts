import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

/**
 * Objetivo: listar timeline de eventos de um ticket.
 * Entrada: `ticketId` na rota e autenticação obrigatória.
 * Saída: 200 com lista de eventos ordenada desc por `createdAt`.
 * Erros: 401 sem sessão; 404 ticket inexistente; 500 inesperado.
 * Efeitos colaterais: apenas leitura.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  const { ticketId } = await params

  try {
    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId: userId } })
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const events = await prisma.ticketEvent.findMany({
      where: { ownerId: userId, ticketId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json(events)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch ticket events' }, { status: 500 })
  }
}

/**
 * Objetivo: adicionar evento manual à timeline para rastreabilidade operacional.
 * Entrada: `ticketId` + body JSON (`type` opcional, `note` obrigatório, `payload` opcional).
 * Saída: 201 com evento criado.
 * Erros: 400 quando `note` vazio; 401 sem sessão; 404 ticket inexistente; 500 inesperado.
 * Efeitos colaterais: escrita em `TicketEvent` e atualização de `currentEventAt` no ticket.
 */
export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response

  const { ticketId } = await params

  try {
    const body = await request.json()
    const note = asString(body.note)

    if (!note) {
      return NextResponse.json({ error: 'note is required' }, { status: 400 })
    }

    const ticket = await prisma.maintenanceTicket.findFirst({ where: { id: ticketId, ownerId: userId } })
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const now = new Date()

    const [event] = await prisma.$transaction([
      prisma.ticketEvent.create({
        data: {
          ownerId: userId,
          ticketId,
          type: asString(body.type, 'ManualNote'),
          note,
          payload: body.payload ?? null,
          createdById: userId,
        },
      }),
      prisma.maintenanceTicket.update({
        where: { id: ticketId },
        data: { currentEventAt: now },
      }),
    ])

    return NextResponse.json(event, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Failed to append ticket event' }, { status: 500 })
  }
}
