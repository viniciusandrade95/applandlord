# Sprint 6 — Núcleo financeiro (pagamentos com confirmação + despesas)

Data: 2026-04-18

## Objetivo da sprint
Fechar o núcleo financeiro com:
1. Registo de pagamento com comprovativo opcional.
2. Estado `AwaitingConfirmation` em cobranças até validação manual.
3. CRUD de despesas por imóvel/contrato.
4. Cálculo de lucro líquido mensal.
5. Ajustes no dashboard financeiro.

---

## Mudanças de dados

### Schema afetado
- `Payment`
  - `receiptUrl String?`
  - `confirmationStatus String @default("AwaitingConfirmation")`
  - `confirmedAt DateTime?`
  - `confirmedByUserId String?`
  - índice adicional: `(ownerId, confirmationStatus)`
- `Invoice.status` passa a usar também `AwaitingConfirmation` no fluxo de negócio.

### Migração aplicada
- `prisma/migrations/20260418220000_sprint6_financial_core/migration.sql`.

### Impacto em dados existentes
- Pagamentos legados são normalizados para `confirmationStatus = Confirmed`.
- `confirmedAt` legado recebe fallback de `paidAt`.

### Plano de rollback
- Script: `prisma/migrations/20260418220000_sprint6_financial_core/rollback.sql`.
- Remove índice novo e colunas adicionadas em `Payment`.
- Requer validação prévia se serviços consumidores dependem dos novos campos.

---

## Funções criadas/alteradas

## `lib/finance.ts`

### `normalizePaymentConfirmationState(status)`
- **Objetivo:** validar estado de confirmação do pagamento.
- **Entrada:**
  - `status: string`.
  - Exemplo válido: `"AwaitingConfirmation"`.
- **Saída:**
  - `PaymentConfirmationState` (`AwaitingConfirmation | Confirmed`).
- **Erros possíveis:**
  - `Invalid payment confirmation status: <valor>`.
- **Efeitos colaterais:**
  - nenhum.

### `validatePaymentDraft(input)`
- **Objetivo:** normalizar/validar payload de criação de pagamento.
- **Entrada:**
  - `amount: unknown` (obrigatório > 0 após normalização).
  - `invoiceAmount: number` fallback.
  - `method: unknown` (fallback: `Bank transfer`).
  - `receiptUrl: unknown` (opcional, precisa de `http://` ou `https://`).
  - `reference`, `notes`: opcionais.
- **Saída:**
  - `{ amount, method, receiptUrl, reference, notes }` pronto para persistência.
- **Erros possíveis:**
  - `amount must be greater than zero`.
  - `method is required`.
  - `receiptUrl must start with http:// or https://`.
- **Efeitos colaterais:**
  - nenhum.

## `lib/rent-state-machine.ts` (alterada)

### `normalizeRentChargeState(status)`
- **Objetivo:** agora aceita também `AwaitingConfirmation`.
- **Entrada/Saída:** string -> `RentChargeState`.
- **Erros:** estado fora da enum de domínio.
- **Efeitos colaterais:** nenhum.

### `assertRentChargeTransitionAllowed(input)`
- **Objetivo:** validar transições incluindo novo estado intermediário.
- **Regras novas relevantes:**
  - `Partial -> AwaitingConfirmation` permitido.
  - `AwaitingConfirmation -> Paid | Partial | Overdue | Canceled` permitido.
- **Erros:** transição inválida / mesmo estado.
- **Efeitos colaterais:** nenhum.

---

## Endpoints criados/alterados

## `POST /api/payments`

### Contrato de entrada
- **Body JSON**
  - `invoiceId: string` (obrigatório)
  - `amount?: number|string`
  - `method?: string`
  - `paidAt?: string` (ISO)
  - `receiptUrl?: string` (http/https)
  - `reference?: string`
  - `notes?: string`
- **Headers:** sessão autenticada obrigatória.

### Contrato de saída
- `201` pagamento criado com `confirmationStatus=AwaitingConfirmation`.
- `400` payload inválido.
- `401` sem sessão.
- `404` cobrança não encontrada.
- `500` erro interno.

### Regras de auth/authz
- Apenas owner autenticado cria pagamento para cobrança do próprio tenant (`ownerId`).

### Casos de erro e mensagens
- `invoiceId is required`
- `Invoice not found`
- `amount must be greater than zero`
- `receiptUrl must start with http:// or https://`

### Efeitos colaterais
- `INSERT Payment`
- `UPDATE Invoice.status = AwaitingConfirmation`
- `INSERT AuditLog (PAYMENT_REGISTERED)`

## `POST /api/payments/:paymentId/confirm`

### Contrato de entrada
- **Path:** `paymentId` obrigatório.
- **Body JSON opcional:** `{ note?: string }`.
- **Headers:** sessão autenticada obrigatória.

### Contrato de saída
- `200` `{ paymentId, invoiceId, invoiceStatus, paymentStatus, confirmedAt, note }`
- `400` pagamento já confirmado / id inválido
- `401` sem sessão
- `404` pagamento não encontrado
- `500` erro interno

### Regras de auth/authz
- Apenas owner do pagamento pode confirmar.

### Casos de erro e mensagens
- `paymentId is required`
- `Payment not found`
- `Payment already confirmed`

### Efeitos colaterais
- `UPDATE Payment.confirmationStatus = Confirmed`
- `UPDATE Invoice.status = Paid | Partial`
- `INSERT AuditLog (PAYMENT_CONFIRMED)`

## `GET /api/expenses`
- Query opcional: `propertyId`, `leaseId`.
- `200` lista de despesas com joins (`property`, `unit`, `lease`, `invoice`).
- `401` não autenticado.
- `500` erro interno.

## `POST /api/expenses`
- Body:
  - `category` obrigatório.
  - `amount` obrigatório > 0.
  - `propertyId` **ou** `leaseId` obrigatório.
  - opcionais: `unitId`, `invoiceId`, `description`, `incurredAt`.
- Saída:
  - `201` despesa criada.
  - `400`, `401`, `404`, `500` conforme validação/tenant.

## `PATCH /api/expenses/:expenseId`
- Atualiza `category`, `amount`, `description`, `incurredAt`.
- `200` despesa atualizada.
- `400` payload inválido.
- `404` não encontrada.

## `DELETE /api/expenses/:expenseId`
- `200 { success: true }`.
- `404` se não existir no tenant.

---

## Fluxo ponta-a-ponta de pagamento confirmado
1. Criar/ter uma cobrança (`Invoice`) em `Pending`/`Partial`/`Overdue`.
2. Chamar `POST /api/payments` com `invoiceId` e opcional `receiptUrl`.
3. Sistema cria pagamento `AwaitingConfirmation` e move cobrança para `AwaitingConfirmation`.
4. Senhorio revisa comprovativo/metadados.
5. Chamar `POST /api/payments/:paymentId/confirm`.
6. Sistema confirma pagamento e fecha cobrança como:
   - `Paid` se total confirmado >= valor da cobrança.
   - `Partial` se total confirmado < valor da cobrança.
7. Dashboard passa a contar valor em receita confirmada e lucro líquido.

---

## Testes automatizados executados
- `node --test tests/rent-state-machine.test.js`
- `node --test tests/payment-confirmation-rules.test.js`

## Como testar manualmente (passo a passo)
1. Criar `Property`, `Unit`, `Renter`, `Lease`.
2. Criar cobrança (`POST /api/invoices`).
3. Registar pagamento:
   - sem comprovativo,
   - e depois com comprovativo `https://...`.
4. Verificar cobrança em `AwaitingConfirmation`.
5. Confirmar pagamento via endpoint de confirmação.
6. Verificar cobrança em `Paid` ou `Partial`.
7. Criar despesas:
   - vinculada a `propertyId`;
   - vinculada a `leaseId`.
8. Editar despesa (`PATCH`) e apagar (`DELETE`).
9. Consultar dashboard e validar:
   - `monthlyConfirmedPayments`
   - `monthlyExpenses`
   - `monthlyNetProfit`
   - `awaitingConfirmation`.

## Cenários de erro e borda
- `amount = 0` em pagamento/despesa => `400`.
- `receiptUrl` sem http/https => `400`.
- Confirmar pagamento já confirmado => `400`.
- IDs de outro owner => `404` por isolamento de tenancy.
- Pagamento parcial confirmado não fecha cobrança (`Partial`).

## Evidência de sucesso
- Testes automatizados de máquina de estados e confirmação passando.
- Dashboard retorna agregados financeiros novos sem erro.
- Fluxo completo de confirmação manual concluído via API.
