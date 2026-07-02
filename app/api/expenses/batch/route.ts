import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { asDate, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

/** Limite por lote. createMany é uma instrução atómica; cobre portefólios muito grandes
 *  mantendo tudo-ou-nada (sem meio-mês lançado). ~6 colunas × 5000 = 30k binds < 65535. */
const MAX_ITEMS = 5000

/**
 * Converte o valor recebido num número, SEM adivinhar formatos ambíguos.
 * - number → usa tal como vem (JSON já é ponto-decimal).
 * - string → só aceita decimal canónico ("1234" ou "1234.56"); devolve null para
 *   qualquer outro formato ("1.234", "1.234,56", "1e9", "abc"). Assim nunca corrompemos
 *   nem descartamos silenciosamente um valor pt-BR mal formatado — sinalizamos erro.
 */
function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!/^\d+(\.\d+)?$/.test(s)) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function isBlank(raw: unknown): boolean {
  return raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')
}

/**
 * POST /api/expenses/batch
 * Lança várias despesas da MESMA categoria num só pedido (ex.: as contas de luz do mês).
 * Body: { category, incurredAt?, idempotencyKey?, items: [{ propertyId, amount, description? }] }
 * - Linhas em branco (amount vazio/≤0) são ignoradas; valores mal formatados devolvem 400
 *   (nunca são corrompidos nem descartados em silêncio).
 * - Valida que todos os imóveis pertencem ao owner autenticado.
 * - `idempotencyKey` (opcional): dois envios com a mesma chave lançam o lote UMA vez —
 *   protege contra duplo-clique, retry de rede e pedidos concorrentes.
 * - `createMany` (uma instrução) — atómico e eficiente mesmo com milhares de linhas.
 * Resposta: 201 { created, total } (ou 200 { created, total, duplicate:true } num reenvio).
 */
export async function POST(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const category = asString(body.category)
    if (!category) return NextResponse.json({ error: 'category is required' }, { status: 400 })

    const incurredAt = body.incurredAt ? asDate(body.incurredAt) : new Date()
    const idempotencyKey = asString(body.idempotencyKey) || null
    const rawItems: unknown[] = Array.isArray(body.items) ? body.items : []

    const items: { propertyId: string; amount: number; description: string | null }[] = []
    let invalidCount = 0
    for (const raw of rawItems) {
      const it = (raw ?? {}) as { propertyId?: string | number | null; amount?: unknown; description?: string | number | null }
      const propertyId = asString(it.propertyId)
      if (!propertyId) continue
      if (isBlank(it.amount)) continue // linha em branco → ignorar
      const amount = parseAmount(it.amount)
      if (amount === null) { invalidCount += 1; continue } // presente mas mal formatado → erro
      if (amount <= 0) continue // zero/negativo → tratar como linha em branco
      items.push({ propertyId, amount, description: asString(it.description) || null })
    }

    if (invalidCount > 0) {
      return NextResponse.json(
        { error: `${invalidCount} valor(es) em formato inválido. Use apenas números (ex.: 1234.56).` },
        { status: 400 },
      )
    }
    if (!items.length) {
      return NextResponse.json({ error: 'Nenhum valor válido para lançar.' }, { status: 400 })
    }
    if (items.length > MAX_ITEMS) {
      return NextResponse.json({ error: `Demasiados itens num só lote (máximo ${MAX_ITEMS}).` }, { status: 400 })
    }

    const ids = [...new Set(items.map((item) => item.propertyId))]
    const owned = await prisma.property.findMany({ where: { id: { in: ids }, ownerId: userId }, select: { id: true } })
    if (owned.length !== ids.length) {
      return NextResponse.json({ error: 'Um ou mais imóveis não foram encontrados.' }, { status: 404 })
    }

    const total = items.reduce((sum, item) => sum + item.amount, 0)

    const outcome = await prisma.$transaction(async (tx) => {
      // Serializa pedidos com a mesma chave e torna o "verificar-antes-de-inserir" atómico.
      if (idempotencyKey) {
        // $executeRaw (não $queryRaw): pg_advisory_xact_lock devolve void e o queryRaw falha a desserializar.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`batch:${userId}:${idempotencyKey}`})::bigint)`
        const prior = await tx.auditLog.findFirst({
          where: {
            ownerId: userId,
            action: 'EXPENSES_BATCH_CREATED',
            metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
          },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        })
        if (prior) {
          const meta = (prior.metadata ?? {}) as { count?: number; total?: number }
          return { created: Number(meta.count ?? 0), total: Number(meta.total ?? 0), duplicate: true }
        }
      }

      const created = await tx.expense.createMany({
        data: items.map((item) => ({
          ownerId: userId,
          propertyId: item.propertyId,
          category,
          description: item.description,
          amount: item.amount,
          incurredAt,
        })),
      })

      // A linha de auditoria é também o registo de idempotência — escrita na MESMA transação.
      await tx.auditLog.create({
        data: {
          ownerId: userId,
          actorId: userId,
          action: 'EXPENSES_BATCH_CREATED',
          entityType: 'Expense',
          severity: 'INFO',
          metadata: { category, count: created.count, total, idempotencyKey } as Prisma.InputJsonValue,
          ipAddress: request.headers.get('x-forwarded-for'),
          userAgent: request.headers.get('user-agent'),
        },
      })

      return { created: created.count, total, duplicate: false }
    })

    return NextResponse.json(
      { created: outcome.created, total: outcome.total, ...(outcome.duplicate ? { duplicate: true } : {}) },
      { status: outcome.duplicate ? 200 : 201 },
    )
  } catch (error) {
    console.error('expenses/batch failed:', error)
    return NextResponse.json({ error: 'Não foi possível lançar as contas. Tente novamente.' }, { status: 500 })
  }
}
