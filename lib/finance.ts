import { asNumber, asString } from '@/lib/landlord'

export const PAYMENT_CONFIRMATION_STATES = ['AwaitingConfirmation', 'Confirmed'] as const

export type PaymentConfirmationState = (typeof PAYMENT_CONFIRMATION_STATES)[number]

/**
 * Objetivo: normalizar e validar o estado de confirmação de um pagamento para o conjunto oficial.
 *
 * Parâmetros de entrada:
 * - status (string): estado bruto vindo de API/DB.
 *
 * Validações:
 * - trim obrigatório.
 * - deve pertencer a `AwaitingConfirmation | Confirmed`.
 *
 * Saída:
 * - `PaymentConfirmationState` normalizado.
 *
 * Erros possíveis:
 * - `Error` quando o estado é inválido.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function normalizePaymentConfirmationState(status: string): PaymentConfirmationState {
  const normalized = status.trim() as PaymentConfirmationState
  if (!PAYMENT_CONFIRMATION_STATES.includes(normalized)) {
    throw new Error(`Invalid payment confirmation status: ${status}`)
  }

  return normalized
}

type PrimitiveInput = FormDataEntryValue | string | number | null | undefined

export type PaymentDraftInput = {
  amount: PrimitiveInput
  invoiceAmount: number
  method: PrimitiveInput
  receiptUrl: PrimitiveInput
  reference: PrimitiveInput
  notes: PrimitiveInput
}

export type PaymentDraftNormalized = {
  amount: number
  method: string
  receiptUrl: string | null
  reference: string | null
  notes: string | null
}

/**
 * Objetivo: consolidar e validar payload de criação de pagamento para evitar valores inválidos.
 *
 * Parâmetros de entrada:
 * - input.amount (unknown): valor informado no body.
 * - input.invoiceAmount (number): fallback mínimo esperado da cobrança.
 * - input.method (unknown): método de pagamento.
 * - input.receiptUrl (unknown): URL opcional do comprovativo.
 * - input.reference/input.notes (unknown): metadados opcionais.
 *
 * Validações:
 * - valor final deve ser > 0.
 * - método não pode ser vazio.
 * - URL de comprovativo, quando enviada, deve começar com http:// ou https://.
 *
 * Saída:
 * - `PaymentDraftNormalized` com tipos finais persistíveis.
 *
 * Erros possíveis:
 * - `Error` para amount <= 0.
 * - `Error` para método vazio.
 * - `Error` para receiptUrl inválida.
 *
 * Efeitos colaterais:
 * - nenhum (função pura).
 */
export function validatePaymentDraft(input: PaymentDraftInput): PaymentDraftNormalized {
  const amount = asNumber(input.amount, input.invoiceAmount)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be greater than zero')
  }

  const method = asString(input.method, 'Bank transfer')
  if (!method) {
    throw new Error('method is required')
  }

  const receiptUrl = asString(input.receiptUrl) || null
  if (receiptUrl && !/^https?:\/\//i.test(receiptUrl)) {
    throw new Error('receiptUrl must start with http:// or https://')
  }

  return {
    amount,
    method,
    receiptUrl,
    reference: asString(input.reference) || null,
    notes: asString(input.notes) || null,
  }
}
