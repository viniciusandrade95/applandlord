import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'
import {
  parseLeaseWizardPayload,
  validateLeaseRelations,
  validateLeaseSchedule,
} from '@/lib/lease-wizard'

/**
 * Objetivo: listar contratos do senhorio autenticado para abastecer painel e wizard.
 * Entrada: sem parâmetros; autenticação via cookie de sessão.
 * Saída: 200 com array de contratos e relacionamentos (property, unit, renter, invoices).
 * Erros: 401 sem sessão; 500 em falha de consulta.
 * Efeitos colaterais: apenas leitura no banco.
 */
export async function GET() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const leases = await prisma.lease.findMany({
      where: { ownerId: userId },
      include: {
        property: true,
        unit: true,
        renter: true,
        invoices: {
          where: { ownerId: userId },
          orderBy: {
            dueDate: 'desc',
          },
          take: 12,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(leases)
  } catch {
    return NextResponse.json({ error: 'Falha ao buscar contratos.' }, { status: 500 })
  }
}

/**
 * Objetivo: resolver inquilino do wizard, criando um novo registro quando necessário.
 * Entrada: payload normalizado e ownerId.
 * Saída: id do inquilino existente/novo para vincular ao contrato.
 * Erros: Error quando inquilino não existe ou criação falha por validação.
 * Efeitos colaterais: pode gravar novo registro em `Renter`.
 */
async function resolveRenterId(payload: ReturnType<typeof parseLeaseWizardPayload>, ownerId: string) {
  if (payload.renterMode === 'new' && payload.newRenter) {
    const renter = await prisma.renter.create({
      data: {
        ownerId,
        fullName: payload.newRenter.fullName,
        email: payload.newRenter.email,
        phone: payload.newRenter.phone,
        governmentId: payload.newRenter.governmentId,
        notes: payload.newRenter.notes,
      },
    })

    return renter.id
  }

  const renter = await prisma.renter.findFirst({
    where: { id: payload.renterId, ownerId },
    select: { id: true },
  })

  if (!renter) {
    throw new Error('Inquilino selecionado não foi encontrado.')
  }

  return renter.id
}

/**
 * Objetivo: criar contrato pelo fluxo wizard com suporte a seleção/criação de inquilino.
 * Entrada: body JSON contendo propertyId, unitId, dados do contrato e renterMode.
 * Saída: 201 com contrato criado + relacionamentos.
 * Erros: 400 validação, 404 entidades inexistentes, 409 conflito de unidade ocupada/ativa, 500 inesperado.
 * Efeitos colaterais: grava Lease, pode gravar Renter, atualiza status da Unit e grava AuditLog.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const payload = parseLeaseWizardPayload(body)

    validateLeaseSchedule(payload.startDate, payload.endDate, payload.dueDay)

    const [property, unit, activeLeaseCountForUnit] = await Promise.all([
      prisma.property.findFirst({ where: { id: payload.propertyId, ownerId: userId } }),
      prisma.unit.findFirst({ where: { id: payload.unitId, ownerId: userId } }),
      prisma.lease.count({ where: { ownerId: userId, unitId: payload.unitId, status: 'Active' } }),
    ])

    if (!property) {
      return NextResponse.json({ error: 'Imóvel não encontrado para a conta atual.' }, { status: 404 })
    }

    if (!unit) {
      return NextResponse.json({ error: 'Unidade não encontrada para a conta atual.' }, { status: 404 })
    }

    validateLeaseRelations({
      unitPropertyId: unit.propertyId,
      selectedPropertyId: payload.propertyId,
      unitStatus: unit.status,
      activeLeaseCountForUnit,
    })

    const renterId = await resolveRenterId(payload, userId)

    const lease = await prisma.lease.create({
      data: {
        ownerId: userId,
        propertyId: payload.propertyId,
        unitId: payload.unitId,
        renterId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        monthlyRent: payload.monthlyRent,
        depositAmount: payload.depositAmount,
        dueDay: payload.dueDay,
        status: payload.status,
        notes: payload.notes,
      },
      include: {
        property: true,
        unit: true,
        renter: true,
      },
    })

    const isCurrentLeaseActive = lease.status === 'Active'

    await prisma.unit.update({
      where: { id: payload.unitId },
      data: {
        status: isCurrentLeaseActive ? 'Occupied' : 'Vacant',
      },
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'LEASE_CREATED',
      entityType: 'Lease',
      entityId: lease.id,
      metadata: {
        propertyId: payload.propertyId,
        unitId: payload.unitId,
        renterId,
        monthlyRent: payload.monthlyRent,
        status: lease.status,
        renterMode: payload.renterMode,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(lease, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('já possui contrato ativo') || error.message.includes('ocupada')) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }

      if (
        error.message.includes('vencimento') ||
        error.message.includes('início') ||
        error.message.includes('fim') ||
        error.message.includes('obrigatórios') ||
        error.message.includes('inquilino') ||
        error.message.includes('não pertence')
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    return NextResponse.json({ error: 'Falha ao criar contrato.' }, { status: 500 })
  }
}

/**
 * Objetivo: atualizar estado de contrato (ex.: encerramento) com ajuste de ocupação da unidade.
 * Entrada: body JSON com leaseId + campos opcionais (status, endDate, notes).
 * Saída: 200 com contrato atualizado.
 * Erros: 400 leaseId ausente, 404 não encontrado, 500 falha inesperada.
 * Efeitos colaterais: atualiza Lease, pode atualizar Unit e grava AuditLog.
 */
export async function PATCH(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const leaseId = asString(body.leaseId)

    if (!leaseId) {
      return NextResponse.json({ error: 'leaseId is required' }, { status: 400 })
    }

    const lease = await prisma.lease.findFirst({
      where: { id: leaseId, ownerId: userId },
      include: { unit: true },
    })

    if (!lease) {
      return NextResponse.json({ error: 'Lease not found' }, { status: 404 })
    }

    const updatedLease = await prisma.lease.update({
      where: { id: leaseId },
      data: {
        status: asString(body.status, 'Ended'),
        endDate: body.endDate ? asDate(body.endDate) : new Date(),
        notes: body.notes !== undefined ? asString(body.notes) : lease.notes,
      },
      include: {
        property: true,
        unit: true,
        renter: true,
      },
    })

    const activeLeaseCount = await prisma.lease.count({
      where: {
        ownerId: userId,
        unitId: lease.unitId,
        status: 'Active',
      },
    })

    if (activeLeaseCount === 0) {
      await prisma.unit.update({
        where: { id: lease.unitId },
        data: { status: 'Vacant' },
      })
    }

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'LEASE_UPDATED',
      entityType: 'Lease',
      entityId: leaseId,
      metadata: {
        oldStatus: lease.status,
        newStatus: updatedLease.status,
        endDate: updatedLease.endDate?.toISOString() ?? null,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(updatedLease)
  } catch {
    return NextResponse.json({ error: 'Failed to update lease' }, { status: 500 })
  }
}
