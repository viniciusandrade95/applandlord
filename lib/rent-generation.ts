import { prisma } from '@/lib/prisma'
import { dueDateForPeriod, isActiveLease, monthKey } from '@/lib/landlord'

export type GenerateRentChargesInput = {
  ownerId: string
  period?: string
  referenceDate?: Date
}

export type GeneratedRentCharge = {
  invoiceId: string
  leaseId: string
  period: string
  amount: number
  dueDate: string
}

export type SkippedRentCharge = {
  leaseId: string
  reason: 'LEASE_NOT_ACTIVE_IN_REFERENCE_DATE' | 'ALREADY_EXISTS_FOR_PERIOD'
}

export type GenerateRentChargesOutput = {
  period: string
  createdCount: number
  skippedCount: number
  created: GeneratedRentCharge[]
  skipped: SkippedRentCharge[]
}

/**
 * Objetivo: gerar automaticamente cobranças de renda para leases elegíveis de um owner no período informado.
 *
 * Entradas:
 * - input.ownerId (string, obrigatório): tenant/owner autenticado.
 * - input.period (string opcional, formato `YYYY-MM`): período alvo da geração. Default `monthKey(referenceDate)`.
 * - input.referenceDate (Date opcional): data de referência para validar lease ativa.
 *
 * Validações:
 * - `ownerId` não pode ser vazio.
 * - `period` precisa seguir `YYYY-MM`.
 *
 * Saída:
 * - Promise<GenerateRentChargesOutput>
 *   - `created`: lista de cobranças criadas com ids/valor/vencimento.
 *   - `skipped`: leases ignoradas com motivo (`já existe` ou `lease não ativa`).
 *
 * Erros possíveis:
 * - lança `Error('ownerId is required')` quando owner não informado.
 * - lança `Error('period must be in YYYY-MM format')` quando período inválido.
 * - erros de banco (Prisma) são propagados para camada de rota.
 *
 * Efeitos colaterais:
 * - leitura de leases (`Lease`).
 * - leitura de cobrança existente por `(leaseId, period)` em `rent_charges`.
 * - escrita de novas cobranças em `rent_charges`.
 */
export async function generateRentChargesForPeriod(input: GenerateRentChargesInput): Promise<GenerateRentChargesOutput> {
  const ownerId = input.ownerId?.trim()
  if (!ownerId) {
    throw new Error('ownerId is required')
  }

  const referenceDate = input.referenceDate ?? new Date()
  const period = (input.period?.trim() || monthKey(referenceDate)).trim()

  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error('period must be in YYYY-MM format')
  }

  const leases = await prisma.lease.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'asc' },
  })

  const created: GeneratedRentCharge[] = []
  const skipped: SkippedRentCharge[] = []

  for (const lease of leases) {
    if (!isActiveLease(lease, referenceDate)) {
      skipped.push({ leaseId: lease.id, reason: 'LEASE_NOT_ACTIVE_IN_REFERENCE_DATE' })
      continue
    }

    const existing = await prisma.invoice.findUnique({
      where: {
        leaseId_period: {
          leaseId: lease.id,
          period,
        },
      },
      select: { id: true },
    })

    if (existing) {
      skipped.push({ leaseId: lease.id, reason: 'ALREADY_EXISTS_FOR_PERIOD' })
      continue
    }

    const dueDate = dueDateForPeriod(period, lease.dueDay)

    const invoice = await prisma.invoice.create({
      data: {
        ownerId,
        leaseId: lease.id,
        period,
        dueDate,
        amount: lease.monthlyRent,
        status: 'Pending',
      },
      select: {
        id: true,
        leaseId: true,
        period: true,
        amount: true,
        dueDate: true,
      },
    })

    created.push({
      invoiceId: invoice.id,
      leaseId: invoice.leaseId,
      period: invoice.period,
      amount: invoice.amount,
      dueDate: invoice.dueDate.toISOString(),
    })
  }

  return {
    period,
    createdCount: created.length,
    skippedCount: skipped.length,
    created,
    skipped,
  }
}
