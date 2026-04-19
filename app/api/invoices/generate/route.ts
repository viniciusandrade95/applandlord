import { NextResponse } from 'next/server'
import { requireCurrentUserId } from '@/lib/auth'
import { generateRentChargesForPeriod } from '@/lib/rent-generation'
import { logAuditEvent } from '@/lib/audit'

/**
 * Objetivo: executar geração automática de cobranças de renda para um período.
 * Entrada: body opcional `{ period?: "YYYY-MM" }`.
 * Saída: 200 com resumo `{ period, createdCount, skippedCount, created[], skipped[] }`.
 * Erros: 400 período inválido; 401 sem sessão; 500 falha interna.
 * Efeitos colaterais: cria registros em `rent_charges` e grava `AuditLog`.
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))

    const result = await generateRentChargesForPeriod({
      ownerId: userId,
      period: typeof body?.period === 'string' ? body.period : undefined,
      referenceDate: new Date(),
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'RENT_CHARGE_BATCH_GENERATED',
      entityType: 'Invoice',
      metadata: {
        period: result.period,
        createdCount: result.createdCount,
        skippedCount: result.skippedCount,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate invoices'
    const status = message.includes('YYYY-MM') ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
