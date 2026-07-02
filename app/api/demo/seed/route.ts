import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'
import { seedDemoForOwner } from '@/lib/demo-seed'

const DEMO_EMAIL = 'adilson@teste.com'

/**
 * Carrega os dados de demonstração na conta atual. Protegido: só funciona quando a sessão
 * é da conta de demonstração (demo@applandlord.local), para nunca apagar dados reais.
 */
export async function POST() {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  if (user?.email !== DEMO_EMAIL) {
    return NextResponse.json({ error: 'Só disponível na conta de demonstração.' }, { status: 403 })
  }

  try {
    await seedDemoForOwner(userId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao carregar dados demo'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
