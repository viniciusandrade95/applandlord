import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireCurrentUserId } from '@/lib/auth'
import { dueDateForPeriod, monthKey } from '@/lib/landlord'
import { logAuditEvent } from '@/lib/audit'

type RouteContext = { params: Promise<{ unitId: string }> }

/**
 * POST /api/apartments/[unitId]/mark-paid
 * "Marcar como pago" num só pedido, atómico no servidor:
 * garante a fatura do período atual, aproveita um pagamento por confirmar (não duplica),
 * caso contrário regista o pagamento do VALOR EM FALTA, confirma-o e atualiza a fatura.
 * Substitui a orquestração de 3-4 pedidos que o cliente fazia (com riscos de corrida).
 * Resposta: { ok, already?, monthStatus, invoiceId, paymentId? }.
 */
export async function POST(request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { unitId } = await context.params
    const unit = await prisma.unit.findFirst({
      where: { id: unitId, ownerId: userId },
      include: { leases: { where: { status: 'Active' }, orderBy: { createdAt: 'desc' }, take: 1 } },
    })

    if (!unit) return NextResponse.json({ error: 'Apartment not found' }, { status: 404 })
    const lease = unit.leases[0]
    if (!lease) return NextResponse.json({ error: 'Este apartamento não tem contrato ativo.' }, { status: 400 })

    const period = monthKey()

    const result = await prisma.$transaction(async (tx) => {
      // Existe unique(leaseId, period): procuramos QUALQUER fatura do período (incl. cancelada,
      // que é reativada) para nunca violar a constraint com um create.
      let invoice = await tx.invoice.findFirst({
        where: { ownerId: userId, leaseId: lease.id, period },
      })

      if (!invoice) {
        invoice = await tx.invoice.create({
          data: {
            ownerId: userId,
            leaseId: lease.id,
            period,
            dueDate: dueDateForPeriod(period, lease.dueDay),
            amount: lease.monthlyRent,
            status: 'Pending',
          },
        })
      } else if (invoice.status === 'Canceled' || invoice.status === 'Cancelled') {
        invoice = await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'Pending' } })
      }

      // Serializa cliques concorrentes no mesmo apartamento (duas abas/dispositivos):
      // o segundo pedido espera pelo lock e vê o estado já atualizado (early-return "already").
      // Nota: o modelo Invoice está mapeado para a tabela "rent_charges" (@@map no schema).
      await tx.$queryRaw`SELECT id FROM "rent_charges" WHERE id = ${invoice.id} FOR UPDATE`
      invoice = (await tx.invoice.findUnique({ where: { id: invoice.id } })) ?? invoice

      if (invoice.status === 'Paid') {
        return { already: true, monthStatus: 'paid' as const, invoiceId: invoice.id, paymentId: null }
      }

      const confirmed = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { invoiceId: invoice.id, confirmationStatus: 'Confirmed' },
      })
      const confirmedSum = Number(confirmed._sum.amount ?? 0)
      const remaining = Number(invoice.amount) - confirmedSum

      // Reaproveita um pagamento por confirmar (evita duplicados); senão regista só o valor em falta.
      let payment = await tx.payment.findFirst({
        where: { invoiceId: invoice.id, confirmationStatus: 'AwaitingConfirmation' },
        orderBy: { createdAt: 'desc' },
      })

      if (!payment && remaining <= 0) {
        // Já está tudo recebido (ex.: fatura marcada Overdue por engano depois de paga):
        // NÃO fabricamos um pagamento extra — só acertamos o estado da fatura.
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'Paid' } })
        return { already: true, monthStatus: 'paid' as const, invoiceId: invoice.id, paymentId: null }
      }

      if (!payment) {
        payment = await tx.payment.create({
          data: {
            ownerId: userId,
            invoiceId: invoice.id,
            amount: remaining,
            method: 'Bank transfer',
            paidAt: new Date(),
            confirmationStatus: 'AwaitingConfirmation',
          },
        })
      }

      payment = await tx.payment.update({
        where: { id: payment.id },
        data: { confirmationStatus: 'Confirmed', confirmedAt: new Date(), confirmedByUserId: userId },
      })

      const totalConfirmed = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { invoiceId: invoice.id, confirmationStatus: 'Confirmed' },
      })
      const paidInFull = Number(totalConfirmed._sum.amount ?? 0) >= Number(invoice.amount)

      // Alinhado com /api/payments/[id]/confirm: paidAt segue a data do pagamento e
      // não é apagado num estado Parcial.
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: paidInFull ? 'Paid' : 'Partial',
          ...(paidInFull ? { paidAt: payment.paidAt ?? new Date() } : {}),
          paymentMethod: payment.method,
        },
      })

      return {
        already: false,
        monthStatus: paidInFull ? ('paid' as const) : ('due' as const),
        invoiceId: invoice.id,
        paymentId: payment.id,
      }
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'APARTMENT_MARKED_PAID',
      entityType: 'Invoice',
      entityId: result.invoiceId,
      metadata: { unitId, leaseId: lease.id, period, already: result.already, paymentId: result.paymentId },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    // Não expor mensagens internas do Prisma (ex.: unique constraint) ao browser.
    console.error('mark-paid failed:', error)
    return NextResponse.json({ error: 'Não foi possível marcar como pago. Tente novamente.' }, { status: 500 })
  }
}
