# Sprint 5 — Geração automática de rendas + máquina de estados de cobrança

## 1) Objetivo da sprint
Automatizar a geração de cobranças mensais por período com base nos contratos ativos e introduzir uma máquina de estados explícita para cobranças (`rent_charges`), incluindo endpoint seguro para transições e logs de transição.

---

## 2) Mudanças implementadas

### 2.1 Serviço de geração automática
- Novo serviço: `generateRentChargesForPeriod` em `lib/rent-generation.ts`.
- Endpoint `POST /api/invoices/generate` passa a usar o serviço.
- Resultado agora inclui:
  - `createdCount` e `created[]`
  - `skippedCount` e `skipped[]` com motivo do skip.

### 2.2 Máquina de estados de cobrança
- Nova biblioteca de domínio: `lib/rent-state-machine.ts`.
- Estados suportados:
  - `Pending`
  - `Overdue`
  - `Partial`
  - `Paid`
  - `Canceled`
- Transições permitidas:
  - `Pending -> Overdue | Partial | Paid | Canceled`
  - `Overdue -> Partial | Paid | Canceled`
  - `Partial -> Paid | Overdue | Canceled`
  - `Paid -> (nenhuma)`
  - `Canceled -> (nenhuma)`

### 2.3 Endpoint seguro para transições
- Novo endpoint: `POST /api/invoices/{invoiceId}/transition`.
- Garante autenticação e autorização por `ownerId`.
- Rejeita transições inválidas.
- Persiste transição e update de status em transação atômica.

### 2.4 Logs de transição
- Nova tabela/modelo: `RentChargeTransitionLog`.
- Cada transição registra:
  - `ownerId`, `invoiceId`
  - `previousStatus`, `newStatus`
  - `note`, `triggeredByUserId`, `createdAt`
- Além do log dedicado, também grava `AuditLog` com ação `RENT_CHARGE_STATUS_TRANSITIONED`.

---

## 3) Documentação função por função

## 3.1 `generateRentChargesForPeriod(input)` (`lib/rent-generation.ts`)
### Objetivo
Gerar cobranças para o período alvo usando leases ativas e evitar duplicidade por `(leaseId, period)`.

### Entradas
- `ownerId: string` (obrigatório)
  - Validação: não vazio.
  - Exemplo: `"usr_123"`.
- `period?: string` (opcional; `YYYY-MM`)
  - Validação: regex `^\d{4}-\d{2}$`.
  - Exemplo: `"2026-04"`.
- `referenceDate?: Date` (opcional)
  - Utilizada para avaliar se a lease está ativa no instante da geração.
  - Exemplo: `new Date('2026-04-18T00:00:00Z')`.

### Saída
`GenerateRentChargesOutput`:
```json
{
  "period": "2026-04",
  "createdCount": 2,
  "skippedCount": 1,
  "created": [
    {
      "invoiceId": "inv_1",
      "leaseId": "lease_1",
      "period": "2026-04",
      "amount": 950,
      "dueDate": "2026-04-08T12:00:00.000Z"
    }
  ],
  "skipped": [
    {
      "leaseId": "lease_2",
      "reason": "ALREADY_EXISTS_FOR_PERIOD"
    }
  ]
}
```

### Erros possíveis e comportamento esperado
- `ownerId is required` → interrompe execução e propaga erro.
- `period must be in YYYY-MM format` → interrompe execução e propaga erro.
- Erro Prisma/DB → propaga erro para endpoint caller.

### Efeitos colaterais
- Leitura em `Lease` e `rent_charges`.
- Escrita em `rent_charges` (novas cobranças).

## 3.2 `normalizeRentChargeState(status)` (`lib/rent-state-machine.ts`)
### Objetivo
Normalizar e validar um estado conforme lista oficial da máquina.

### Entradas
- `status: string`.
- Validação: precisa ser exatamente um dos estados permitidos.
- Exemplo: `"Pending"`.

### Saída
- `RentChargeState` (`Pending|Overdue|Partial|Paid|Canceled`).

### Erros possíveis
- `Invalid rent charge status: <value>` para estado não permitido.

### Efeitos colaterais
- Nenhum (função pura).

## 3.3 `assertRentChargeTransitionAllowed(input)` (`lib/rent-state-machine.ts`)
### Objetivo
Garantir que uma transição `from -> to` obedece ao grafo permitido.

### Entradas
- `fromStatus: string`.
- `toStatus: string`.
- `note?: string | null` (informacional).

### Saída
- `{ normalizedFrom, normalizedTo }`.
- Exemplo:
```json
{ "normalizedFrom": "Pending", "normalizedTo": "Partial" }
```

### Erros possíveis
- `Transition to the same status is not allowed`.
- `Invalid transition from X to Y`.
- `Invalid rent charge status: ...`.

### Efeitos colaterais
- Nenhum (função pura).

## 3.4 `getRentChargeTransitionMatrix()` (`lib/rent-state-machine.ts`)
### Objetivo
Expor a matriz de transições permitidas para uso em docs/observabilidade.

### Entradas
- Nenhuma.

### Saída
- `Record<RentChargeState, RentChargeState[]>`.

### Erros possíveis
- Nenhum.

### Efeitos colaterais
- Nenhum.

---

## 4) Endpoints criados/alterados

## 4.1 `POST /api/invoices/generate` (alterado)
### Contrato de entrada
- Body opcional:
```json
{ "period": "2026-04" }
```
- Header/cookie de sessão obrigatório.

### Contrato de saída
- `200 OK`:
```json
{
  "period": "2026-04",
  "createdCount": 2,
  "skippedCount": 1,
  "created": [{ "invoiceId": "...", "leaseId": "...", "period": "2026-04", "amount": 950, "dueDate": "..." }],
  "skipped": [{ "leaseId": "...", "reason": "ALREADY_EXISTS_FOR_PERIOD" }]
}
```
- `400 Bad Request`: `period` inválido.
- `401 Unauthorized`: sem sessão.
- `500 Internal Server Error`: falha inesperada.

### Regras de autenticação/autorização
- `requireCurrentUserId` obrigatório.
- Só processa dados de `ownerId` autenticado.

### Casos de erro e mensagens
- `period must be in YYYY-MM format`.
- `Failed to generate invoices` (fallback).

## 4.2 `POST /api/invoices/{invoiceId}/transition` (novo)
### Contrato de entrada
- Path param: `invoiceId`.
- Body:
```json
{ "toStatus": "Overdue", "note": "vencimento ultrapassado" }
```
- Header/cookie de sessão obrigatório.

### Contrato de saída
- `200 OK`:
```json
{
  "invoiceId": "inv_123",
  "previousStatus": "Pending",
  "currentStatus": "Overdue",
  "transitionLogId": "log_123",
  "transitionedAt": "2026-04-18T20:15:00.000Z",
  "note": "vencimento ultrapassado"
}
```
- `400 Bad Request`: payload inválido/transição inválida.
- `401 Unauthorized`: sem sessão.
- `404 Not Found`: cobrança não encontrada no tenant.
- `500 Internal Server Error`: erro interno.

### Regras de autenticação/autorização
- Requer sessão (`requireCurrentUserId`).
- Busca cobrança com filtro `id + ownerId`.
- Impede transições entre tenants.

### Casos de erro e mensagens
- `invoiceId is required`.
- `toStatus is required`.
- `Invoice not found`.
- `Invalid transition from X to Y`.
- `Transition to the same status is not allowed`.

---

## 5) Mudanças de dados

## 5.1 Schema afetado
- `prisma/schema.prisma`
  - novo modelo `RentChargeTransitionLog`.
  - nova relação `Invoice.transitionLogs`.
  - nova relação `User.transitionLogs`.

## 5.2 Migração aplicada
- `prisma/migrations/20260418201000_sprint5_rent_state_machine/migration.sql`
  - cria tabela `RentChargeTransitionLog`.
  - cria FKs para `User` e `rent_charges`.
  - cria índices operacionais por owner/invoice/createdAt.

## 5.3 Impacto em dados existentes
- Não altera nem remove dados antigos.
- Novo comportamento apenas passa a registrar histórico quando houver transição via endpoint novo.

## 5.4 Plano de rollback
- Script de rollback: `prisma/migrations/20260418201000_sprint5_rent_state_machine/rollback.sql`.
- Ação: `DROP TABLE RentChargeTransitionLog`.
- Impacto: perda somente do histórico de transições pós-sprint 5.

---

## 6) Como testar manualmente (passo a passo)

## 6.1 Geração automática por período
1. Fazer login na aplicação.
2. Garantir ao menos uma lease `Active` no owner autenticado.
3. Chamar `POST /api/invoices/generate` com body `{ "period": "2026-04" }`.
4. Verificar retorno `200` e `createdCount > 0` na primeira execução.
5. Reexecutar para o mesmo período e verificar `createdCount = 0` e `skipped` com `ALREADY_EXISTS_FOR_PERIOD`.

## 6.2 Transição válida
1. Selecionar uma cobrança `Pending` do tenant.
2. Chamar `POST /api/invoices/{invoiceId}/transition` com `{ "toStatus": "Overdue" }`.
3. Verificar `200` e mudança para `currentStatus = Overdue`.
4. Confirmar registro em `RentChargeTransitionLog` para o `invoiceId`.

## 6.3 Transição inválida
1. Selecionar cobrança `Paid`.
2. Tentar `{ "toStatus": "Pending" }` no endpoint de transição.
3. Verificar `400` com mensagem `Invalid transition from Paid to Pending`.
4. Confirmar que status da cobrança permaneceu inalterado.

---

## 7) Testes automatizados executados
- `node --test tests/lease-wizard-validation.test.js`
- `node --test tests/rent-state-machine.test.js`

## Evidência de sucesso
- Suite de máquina de estados cobre:
  - estado inválido,
  - transição válida,
  - transição inválida,
  - transição para mesmo estado.
- Endpoint de transição retorna status e `transitionLogId` para rastreabilidade operacional.

---

## 8) Documento de estados e regras de transição (resumo rápido)
| Estado atual | Próximos estados permitidos |
|---|---|
| Pending | Overdue, Partial, Paid, Canceled |
| Overdue | Partial, Paid, Canceled |
| Partial | Paid, Overdue, Canceled |
| Paid | — |
| Canceled | — |

Regra transversal: `fromStatus` e `toStatus` iguais são sempre inválidos.
