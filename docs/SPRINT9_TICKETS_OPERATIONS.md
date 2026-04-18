# Sprint 9 — Tickets operacionais com rastreabilidade

Data: 2026-04-18

## Objetivo da sprint
Consolidar o fluxo de tickets no painel com rastreabilidade formal: criação/gestão, estados formais, timeline de eventos, vínculos de contexto (imóvel/unidade/contrato/inquilino) e filtros úteis por prioridade/estado.

---

## Mudanças de dados

### Schema afetado
- `MaintenanceTicket`:
  - novos campos: `leaseId`, `renterId`, `triagedAt`, `waitingAt`, `closedAt`, `currentEventAt`.
  - status default alterado de `Open` para `New`.
  - novos índices de operação/filtro.
- Nova tabela `TicketEvent` para timeline.

### Migração aplicada
- `prisma/migrations/20260418235000_sprint9_ticket_workflow/migration.sql`.
- Backfill de status legado:
  - `Open -> New`
  - `In progress -> Triaged`
  - `Resolved -> Resolved`

### Impacto em dados existentes
- Tickets legados mantidos e normalizados para estados formais.
- Sem perda de registro; mudança compatível via mapeamento.

### Plano de rollback
1. Executar `prisma/migrations/20260418235000_sprint9_ticket_workflow/rollback.sql`.
2. Remover tabela `TicketEvent`.
3. Remover colunas novas em `MaintenanceTicket`.
4. Reverter status para convenção antiga (`Open/In progress/Resolved`).

---

## Endpoints/API criadas ou alteradas

## 1) `GET /api/tickets`
### Contrato de entrada
- **Auth:** cookie de sessão obrigatório (`requireCurrentUserId`).
- **Query opcional:**
  - `status` (multi-valor): `New|Triaged|Waiting|Resolved|Closed`.
  - `priority` (multi-valor): `Low|Normal|High|Urgent`.

### Contrato de saída
- **200**: lista de tickets com `property`, `unit`, `lease.renter`, `renter` e `events` (até 12).
- **401**: não autenticado.
- **500**: `{ "error": "Failed to fetch tickets" }`.

### Casos de erro e mensagens
- Erro inesperado de consulta: `Failed to fetch tickets`.

## 2) `POST /api/tickets`
### Contrato de entrada
- **Body JSON:**
  ```json
  {
    "title": "Vazamento no WC",
    "description": "Água a escorrer no teto",
    "priority": "High",
    "status": "New",
    "propertyId": "prop_x",
    "unitId": "unit_x",
    "leaseId": "lease_x",
    "renterId": "renter_x",
    "creationNote": "Aberto após chamada"
  }
  ```
- **Validações:**
  - `title` obrigatório.
  - `status` e `priority` devem ser valores formais.
  - vínculos devem pertencer ao owner.
  - consistência opcional `lease` com `propertyId/unitId/renterId`.

### Contrato de saída
- **201**: ticket criado.
- **400**: validação (`title is required`, `Invalid ticket ...`, inconsistência de vínculo).
- **404**: vínculo não encontrado para owner.
- **401**: não autenticado.
- **500**: `{ "error": "Failed to create ticket" }`.

### Efeitos colaterais
- `INSERT` em `MaintenanceTicket`.
- `INSERT` em `TicketEvent` (`TicketCreated`).

## 3) `PATCH /api/tickets/:ticketId`
### Contrato de entrada
- **Body JSON (parcial):**
  - `status`, `priority`, `title`, `description`, `propertyId`, `unitId`, `leaseId`, `renterId`, `note`.
- **Regras de autorização:** ticket deve pertencer ao owner autenticado.
- **Validação de estado:** usa máquina de estados formal.

### Contrato de saída
- **200**: ticket atualizado com timeline recente.
- **400**: transição inválida/igual, prioridade inválida, inconsistência de vínculo.
- **404**: ticket/vínculos não encontrados.
- **401**: não autenticado.
- **500**: `{ "error": "Failed to update ticket" }`.

### Efeitos colaterais
- `UPDATE` em `MaintenanceTicket`.
- `INSERT` em `TicketEvent` (`StatusChanged` ou `TicketUpdated`).

## 4) `GET /api/tickets/:ticketId/events`
### Contrato de entrada
- Sem body/query; `ticketId` na rota.
- Auth obrigatório.

### Contrato de saída
- **200**: timeline (`TicketEvent`) desc por data (até 50).
- **404**: ticket não encontrado.
- **401** / **500** conforme padrão.

## 5) `POST /api/tickets/:ticketId/events`
### Contrato de entrada
- **Body JSON:**
  ```json
  {
    "type": "ManualNote",
    "note": "Fornecedor agenda visita para amanhã",
    "payload": { "supplier": "Canalizador X" }
  }
  ```
- `note` obrigatório.

### Contrato de saída
- **201**: evento criado.
- **400**: `{ "error": "note is required" }`.
- **404**: ticket não encontrado.
- **401** / **500** conforme padrão.

### Efeitos colaterais
- `INSERT` em `TicketEvent`.
- `UPDATE` em `MaintenanceTicket.currentEventAt`.

## 6) Endpoint legado alterado: `GET/POST /api/maintenance`
- Mantido para compatibilidade de integrações antigas.
- Agora usa os estados formais e cria `TicketEvent` na criação.

---

## Funções criadas/alteradas

### `lib/ticket-state-machine.ts`
1. `normalizeTicketPriority`
2. `normalizeTicketStatus`
3. `assertTicketTransitionAllowed`
4. `ticketTransitionTimestamps`

**Entradas/Saídas/Erros/Efeitos colaterais:** documentados em `docs/TICKET_STATE_MACHINE.md`.

### `app/page.tsx` (mudanças de feature)
- `postJson(endpoint, body, message, method='POST')`
  - objetivo: permitir POST/PATCH para gestão de tickets no painel.
  - entrada: endpoint, payload, mensagem de sucesso, método HTTP.
  - saída: recarrega estado e exibe notificação.
  - erros: propaga erro de API (`Falha na operação` ou mensagem da rota).
  - efeitos colaterais: chamadas HTTP para APIs internas e atualização de estado React.
- `filteredTickets` (`useMemo`)
  - objetivo: aplicar filtros de status/prioridade.
  - entrada: coleção de tickets + filtros selecionados.
  - saída: subset para renderização.
  - efeitos colaterais: nenhum.

---

## Features entregues

## 1) Criação e gestão de ticket no painel
- Formulário completo de abertura (imóvel/unidade/contrato/inquilino).
- Botões operacionais de transição (`Triar`, `Aguardar`, `Resolver`, `Fechar`).

## 2) Estados formais
- Implementados: `New`, `Triaged`, `Waiting`, `Resolved`, `Closed`.
- Máquina de estados validada em backend e testes.

## 3) Timeline de eventos
- Toda criação/transição gera `TicketEvent`.
- Painel mostra os 4 eventos mais recentes por ticket.

## 4) Ticket ligado a imóvel/contrato/inquilino
- Campos de vínculo no schema + validação de consistência no backend.

## 5) Filtros por prioridade e status
- Filtros no painel com atualização imediata da listagem.

---

## Como testar manualmente (passo a passo)
1. Iniciar aplicação (`npm run dev`) e autenticar.
2. Abrir painel (`/`) e seção **Operação**.
3. Criar ticket com `priority=High`, `status=New`, vinculando imóvel/unidade/contrato/inquilino.
4. Confirmar ticket na lista e evento `TicketCreated` na timeline.
5. Aplicar filtros (`status=New`, `priority=High`) e validar redução da lista.
6. Clicar `Triar` e validar status `Triaged` + evento `StatusChanged`.
7. Clicar `Aguardar`, depois `Resolver`, depois `Fechar`.
8. Validar timeline com sequência de eventos e estado final `Closed`.
9. Tentar transição inválida via API (ex.: `Closed -> Waiting`) e confirmar `400`.

## Testes automatizados executados
- `node --test tests/ticket-flow.test.js`
- `node --test tests/dashboard-attention-model.test.js tests/rent-state-machine.test.js tests/payment-confirmation-rules.test.js tests/lease-wizard-validation.test.js`

## Evidência de sucesso
- Fluxo completo `New -> Triaged -> Waiting -> Resolved -> Closed` validado em teste automatizado.
- Regressão inválida (`Closed -> Waiting`) bloqueada por regra de transição.
- Painel exibe timeline e filtros funcionais para operação diária.

---

## Documentação técnica relacionada atualizada
- `docs/TICKET_STATE_MACHINE.md`
- `docs/SPRINT9_TICKETS_OPERATIONS.md`
- `CHANGELOG.md`
- `TEMPORAL_CHECKLIST.md`
- `README.md`
