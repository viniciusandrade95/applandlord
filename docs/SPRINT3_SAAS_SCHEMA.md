# Sprint 3 — Modelo de dados robusto para operação SaaS

Data: 2026-04-18.

## 1) Objetivo da sprint
Evoluir o schema para suportar operação SaaS com governança de dados, rastreabilidade de eventos críticos e consistência forte de contratos ativos por unidade.

---

## 2) Mudanças de dados

### 2.1 Schema afetado

- Tabela física de cobrança mensal renomeada de `Invoice` para `rent_charges` (com manutenção do model Prisma `Invoice` via `@@map("rent_charges")` para compatibilidade de código).
- Novas tabelas:
  - `Expense`
  - `Reminder`
  - `WhatsAppMessage`
  - `AuditLog`
- Nova constraint de negócio: **um contrato ativo por unidade/owner** via índice único parcial em `Lease(ownerId, unitId) WHERE status = 'Active'`.
- Novos índices compostos para consultas operacionais (vencimento, status, cronologia e tenant).

### 2.2 Migração aplicada

- **Up migration:** `prisma/migrations/20260418190000_sprint3_saas_schema/migration.sql`
- **Rollback migration:** `prisma/migrations/20260418190000_sprint3_saas_schema/rollback.sql`

### 2.3 Impacto em dados existentes

- Sem perda de dados esperada.
- Registros existentes da tabela `Invoice` são preservados, apenas movidos para `rent_charges` (rename físico da tabela).
- APIs existentes continuam operando com `prisma.invoice` por conta do mapeamento Prisma `@@map`.
- Pode haver falha de inserção de `Lease` com status `Active` se existir contrato ativo prévio para a mesma unidade+owner (comportamento desejado para garantir consistência).

### 2.4 Plano de rollback

1. Remover FKs das tabelas novas (`Expense`, `Reminder`, `WhatsAppMessage`, `AuditLog`).
2. Remover índices novos (incluindo constraint parcial de lease ativa).
3. Dropar tabelas novas.
4. Renomear `rent_charges` de volta para `Invoice` e restaurar nomes de índices.

Implementação SQL pronta em `rollback.sql`.

---

## 3) ER simplificado (modelo lógico)

```text
User (owner)
 ├─< Property ─< Unit ─< Lease >─ Renter
 │                    ├─< rent_charges (model Invoice) ─< Payment
 │                    │                      ├─< Expense
 │                    │                      ├─< Reminder ─< WhatsAppMessage
 │                    │                      └─< WhatsAppMessage
 │                    └─< Expense
 ├─< MaintenanceTicket
 ├─< Expense
 ├─< Reminder
 ├─< WhatsAppMessage
 └─< AuditLog
```

Legenda:
- `A ─< B` = relação 1:N (um A para muitos B).
- `rent_charges` é tabela física; no código Prisma permanece `Invoice`.

---

## 4) Matriz de entradas/saídas por tabela

## 4.1 `rent_charges` (model `Invoice`)
- **Entrada principal:** `ownerId`, `leaseId`, `period`, `dueDate`, `amount`, `status`, `notes`.
- **Validações:**
  - `leaseId` deve existir e pertencer ao owner;
  - unicidade `(leaseId, period)`;
  - `amount > 0` no fluxo de API.
- **Saída principal:** registro de cobrança com relacionamento de `lease` e `payments`.
- **Exemplo (API):**
  ```json
  {
    "ownerId": "usr_1",
    "leaseId": "lease_1",
    "period": "2026-04",
    "dueDate": "2026-04-08T00:00:00.000Z",
    "amount": 1200,
    "status": "Pending"
  }
  ```

## 4.2 `Expense`
- **Entrada:** `ownerId` (obrigatório), `category` (obrigatório), `amount` (obrigatório), vínculos opcionais (`propertyId`, `unitId`, `leaseId`, `invoiceId`), `description`, `incurredAt`.
- **Validações esperadas:**
  - `amount > 0` (regra de domínio esperada em API);
  - FKs opcionais devem apontar para registros existentes.
- **Saída:** despesa registrada com escopo financeiro (imóvel/unidade/contrato/cobrança).

## 4.3 `Reminder`
- **Entrada:** `ownerId`, `scheduledFor`, `channel`, `status`, `attempts`, `payload` + vínculos opcionais `leaseId` e `invoiceId`.
- **Validações esperadas:**
  - `scheduledFor` obrigatório;
  - status controlado por fluxo de job (`Pending`, `Sent`, `Failed`, etc).
- **Saída:** agendamento de lembrete com rastreabilidade de tentativas/envio.

## 4.4 `WhatsAppMessage`
- **Entrada:** `ownerId`, `direction`, `messageType`, metadados de provider e telefones, `status`, `body`, vínculos opcionais (`renterId`, `invoiceId`, `reminderId`).
- **Validações esperadas:**
  - `direction` (ex.: `outbound`/`inbound`) e `messageType` obrigatórios;
  - `providerMsgId` indexado para reconciliação de callbacks.
- **Saída:** trilha completa de mensagens WhatsApp por tenant.

## 4.5 `AuditLog`
- **Entrada:** `ownerId`, `action`, `entityType`; opcionais: `actorId`, `entityId`, `severity`, `metadata`, `ipAddress`, `userAgent`.
- **Validações:**
  - `ownerId`, `action`, `entityType` obrigatórios.
- **Saída:** evento imutável de auditoria para compliance operacional.
- **Exemplo:**
  ```json
  {
    "ownerId": "usr_1",
    "actorId": "usr_1",
    "action": "PAYMENT_REGISTERED",
    "entityType": "Payment",
    "entityId": "pay_123",
    "severity": "INFO",
    "metadata": {
      "invoiceId": "inv_1",
      "paymentAmount": 950
    }
  }
  ```

---

## 5) Endpoints/API alteradas

## 5.1 `POST /api/leases`

### Contrato de entrada
- **Body:**
  - obrigatórios: `propertyId`, `unitId`, `renterId`, `monthlyRent`
  - opcionais: `startDate`, `endDate`, `depositAmount`, `dueDay`, `status`, `notes`
- **Headers:** cookie de sessão obrigatório (`applandlord_session`).

### Contrato de saída
- `201` com lease criada (inclui `property`, `unit`, `renter`).
- `400` para campos obrigatórios inválidos.
- `404` se `property`, `unit` ou `renter` não existirem no tenant.
- `500` para falha interna.

### Autenticação/autorização
- Sessão obrigatória.
- Todos os IDs de referência são validados dentro do `ownerId` logado.

### Casos de erro relevantes
- Unidade não pertence ao imóvel selecionado.
- Violação da constraint de contrato ativo único por unidade (retorno 500 atual; recomendação futura: mapear para 409).

## 5.2 `PATCH /api/leases`
- **Entrada:** `leaseId` obrigatório; `status`, `endDate`, `notes` opcionais.
- **Saída:** `200` lease atualizada.
- **Erro:** `400` sem `leaseId`; `404` lease inexistente; `500` erro interno.
- **AuthZ:** lease deve pertencer ao owner autenticado.

## 5.3 `POST /api/invoices`
- **Entrada:** `leaseId` obrigatório; opcionais `period`, `amount`, `dueDate`, `status`, `notes`.
- **Saída:** `201` com cobrança criada + relações.
- **Erros:** `400` lease inválida; `500` erro interno/violação de unicidade `(leaseId,period)`.
- **AuthZ:** lease e cobrança sempre no `ownerId` da sessão.

## 5.4 `POST /api/payments`
- **Entrada:** `invoiceId` obrigatório; opcionais `amount`, `paidAt`, `method`, `reference`, `notes`.
- **Saída:** `201` payment criada; side effect de atualização de status da cobrança (`Paid`/`Partial`).
- **Erros:** `400` sem `invoiceId`; `404` cobrança inexistente; `500` erro interno.
- **AuthZ:** cobrança deve pertencer ao owner da sessão.

---

## 6) Funções criadas/alteradas (objetivo, entradas, saídas, erros, efeitos colaterais)

## 6.1 `lib/audit.ts`

### `logAuditEvent(input)`
- **Objetivo:** registrar eventos críticos por tenant em `AuditLog` sem quebrar o fluxo principal.
- **Entrada:**
  - `ownerId: string` obrigatório.
  - `action: string` obrigatório.
  - `entityType: string` obrigatório.
  - opcionais: `actorId`, `entityId`, `severity`, `metadata`, `ipAddress`, `userAgent`.
- **Validações:** obrigatoriedade é garantida no tipo e pela modelagem Prisma (`NOT NULL` para campos críticos).
- **Exemplo de entrada:**
  ```ts
  await logAuditEvent({
    ownerId: 'usr_1',
    actorId: 'usr_1',
    action: 'LEASE_CREATED',
    entityType: 'Lease',
    entityId: 'lease_1',
    metadata: { dueDay: 8 }
  })
  ```
- **Saída:** `Promise<void>`.
- **Erros possíveis:** falha de DB na escrita de log.
- **Comportamento esperado em erro:** captura erro e faz `console.error`, sem relançar exceção.
- **Efeitos colaterais:** `INSERT` em `AuditLog`.

## 6.2 `POST /api/leases` (handler alterado)
- **Objetivo:** criar contrato e registrar auditoria de criação.
- **Entrada/validações:** conforme seção 5.1.
- **Saída:** lease criada + `AuditLog(action='LEASE_CREATED')`.
- **Erros:** validação 400/404; erro interno 500 (incluindo constraint ativa única).
- **Efeitos colaterais:**
  - `INSERT` em `Lease`;
  - `UPDATE Unit.status` para `Occupied` quando ativo;
  - `INSERT` em `AuditLog`.

## 6.3 `PATCH /api/leases` (handler alterado)
- **Objetivo:** atualizar status/fim de contrato e registrar auditoria.
- **Entrada:** `leaseId`, `status`, `endDate`, `notes`.
- **Saída:** lease atualizada + `AuditLog(action='LEASE_UPDATED')`.
- **Erros:** 400, 404, 500.
- **Efeitos colaterais:**
  - `UPDATE` em `Lease`;
  - possível `UPDATE Unit.status` para `Vacant`;
  - `INSERT` em `AuditLog`.

## 6.4 `POST /api/invoices` (handler alterado)
- **Objetivo:** criar cobrança mensal e auditar evento.
- **Entrada:** `leaseId` e campos opcionais de cobrança.
- **Saída:** cobrança criada + `AuditLog(action='RENT_CHARGE_CREATED')`.
- **Erros:** 400/500.
- **Efeitos colaterais:** `INSERT` em `rent_charges` e `AuditLog`.

## 6.5 `POST /api/payments` (handler alterado)
- **Objetivo:** registrar pagamento, atualizar status da cobrança e auditar evento.
- **Entrada:** `invoiceId`, `amount`, `paidAt`, `method`, `reference`, `notes`.
- **Saída:** payment criada + atualização de cobrança + `AuditLog(action='PAYMENT_REGISTERED')`.
- **Erros:** 400/404/500.
- **Efeitos colaterais:**
  - `INSERT` em `Payment`;
  - `UPDATE` em `rent_charges` (status e dados de pagamento);
  - `INSERT` em `AuditLog`.

---

## 7) Como testar manualmente (passo a passo)

1. Executar `npm run prisma:generate`.
2. Aplicar migration Sprint 3 no banco alvo.
3. Criar lease ativa para uma unidade (`POST /api/leases`).
4. Tentar criar segunda lease `Active` para a mesma unidade/owner e verificar falha por constraint.
5. Criar cobrança (`POST /api/invoices`) e confirmar persistência em tabela física `rent_charges`.
6. Registrar pagamento (`POST /api/payments`) e confirmar atualização de status da cobrança (`Paid` ou `Partial`).
7. Validar eventos em `AuditLog` para ações:
   - `LEASE_CREATED`
   - `LEASE_UPDATED`
   - `RENT_CHARGE_CREATED`
   - `PAYMENT_REGISTERED`
8. Inserir um reminder e whatsapp_message (via SQL/prisma studio) para validar FKs opcionais e índices.
9. Rodar `EXPLAIN` nas consultas filtradas por owner/status/dueDate para verificar uso de índice.

---

## 8) Testes de consistência de constraints e índices

### 8.1 Constraint de contrato ativo único
- SQL de teste:
  ```sql
  -- deve falhar na segunda inserção Active para mesmo owner+unit
  INSERT INTO "Lease" ("id","ownerId","propertyId","unitId","renterId","startDate","monthlyRent","depositAmount","dueDay","status","createdAt","updatedAt")
  VALUES ('lease_a','usr_1','prop_1','unit_1','rent_1',CURRENT_TIMESTAMP,1000,0,1,'Active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

  INSERT INTO "Lease" ("id","ownerId","propertyId","unitId","renterId","startDate","monthlyRent","depositAmount","dueDay","status","createdAt","updatedAt")
  VALUES ('lease_b','usr_1','prop_1','unit_1','rent_2',CURRENT_TIMESTAMP,1200,0,1,'Active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  ```
- Resultado esperado: violação de `Lease_one_active_per_unit_owner_key`.

### 8.2 Índices essenciais
- SQL de verificação:
  ```sql
  SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('Lease','rent_charges','Expense','Reminder','WhatsAppMessage','AuditLog','Payment');
  ```
- Resultado esperado: presença de todos os índices definidos na migration da Sprint 3.

### 8.3 Verificação de plano de execução
- SQL de exemplo:
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM "rent_charges"
  WHERE "ownerId" = 'usr_1' AND "status" = 'Pending'
  ORDER BY "dueDate" ASC
  LIMIT 50;
  ```
- Resultado esperado: uso do índice `rent_charges_ownerId_status_dueDate_idx`.

---

## 9) Testes automatizados executados + evidência

- `npm run prisma:generate` ✅ sucesso, Prisma Client gerado com o novo schema.
- `npx prisma format` ✅ sucesso, schema validado e formatado.
- `npm run build` ⚠️ falha por limitação de rede ao baixar Google Fonts (ambiente), sem erro de tipagem local anterior ao fetch remoto.
