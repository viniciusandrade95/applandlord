import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { asDate, asNumber, asString } from '@/lib/landlord'
import { requireCurrentUserId } from '@/lib/auth'
import { logAuditEvent } from '@/lib/audit'

type RouteContext = {
  params: Promise<{
    expenseId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { expenseId } = await context.params
    const safeExpenseId = asString(expenseId)

    if (!safeExpenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 })
    }

    const existing = await prisma.expense.findFirst({ where: { id: safeExpenseId, ownerId: userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const nextCategory = asString(body.category, existing.category)
    const nextAmount = body.amount === undefined ? existing.amount : asNumber(body.amount, existing.amount)

    if (!nextCategory) {
      return NextResponse.json({ error: 'category is required' }, { status: 400 })
    }

    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      return NextResponse.json({ error: 'amount must be greater than zero' }, { status: 400 })
    }

    const expense = await prisma.expense.update({
      where: { id: existing.id },
      data: {
        category: nextCategory,
        amount: nextAmount,
        description: body.description === undefined ? existing.description : asString(body.description) || null,
        incurredAt: body.incurredAt ? asDate(body.incurredAt, existing.incurredAt) : existing.incurredAt,
      },
      include: {
        property: true,
        unit: true,
        lease: {
          include: {
            renter: true,
            property: true,
            unit: true,
          },
        },
        invoice: true,
      },
    })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'EXPENSE_UPDATED',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        category: expense.category,
        amount: expense.amount,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json(expense)
  } catch {
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { userId, response } = await requireCurrentUserId()
  if (!userId) return response ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { expenseId } = await context.params
    const safeExpenseId = asString(expenseId)

    if (!safeExpenseId) {
      return NextResponse.json({ error: 'expenseId is required' }, { status: 400 })
    }

    const existing = await prisma.expense.findFirst({ where: { id: safeExpenseId, ownerId: userId } })
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    await prisma.expense.delete({ where: { id: safeExpenseId } })

    await logAuditEvent({
      ownerId: userId,
      actorId: userId,
      action: 'EXPENSE_DELETED',
      entityType: 'Expense',
      entityId: existing.id,
      metadata: {
        category: existing.category,
        amount: existing.amount,
      },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 })
  }
}
