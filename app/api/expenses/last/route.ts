import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'

/** Segurança: mesmo com `distinct` por imóvel, um portefólio absurdamente grande é limitado. */
const MAX_PROPERTIES = 5000

/**
 * GET /api/expenses/last?category=Energia
 * Devolve o ÚLTIMO valor lançado dessa categoria por imóvel — usado para prefill
 * ("preencher com o último valor" / valor-fantasma) no fluxo de lançamento em lote.
 * Resposta: { map: { [propertyId]: amount } }.
 * Usa `DISTINCT ON ("propertyId")` no Postgres: a dedup acontece na BASE DE DADOS e
 * devolve exatamente UMA linha por imóvel — a mais recente. Custo ~ número de imóveis
 * (não do histórico), e nenhum imóvel fica de fora por causa de uma janela de N despesas.
 * (O `distinct` do Prisma dedupa em memória e traria o histórico inteiro — por isso raw.)
 */
export async function GET(request: Request) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const category = asString(new URL(request.url).searchParams.get('category'))
    if (!category) return NextResponse.json({ map: {} })

    const rows = await prisma.$queryRaw<Array<{ propertyId: string; amount: number }>>`
      SELECT DISTINCT ON ("propertyId") "propertyId", "amount"
      FROM "Expense"
      WHERE "ownerId" = ${userId} AND "category" = ${category} AND "propertyId" IS NOT NULL
      ORDER BY "propertyId", "incurredAt" DESC
      LIMIT ${MAX_PROPERTIES}
    `

    const map: Record<string, number> = {}
    for (const row of rows) {
      if (map[row.propertyId] === undefined) map[row.propertyId] = Number(row.amount)
    }

    return NextResponse.json({ map })
  } catch {
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 })
  }
}
