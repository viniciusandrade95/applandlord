# Arquitetura Técnica v1 — Sprint 1 (Dias 1–5)

## 1) Objetivo do sprint
Fechar decisões de arquitetura, contratos de API, convenções de estado e estratégia de evolução de dados para reduzir retrabalho nas Sprints 2–6.

## 2) Escopo fechado: MVP vs Fase 2

### 2.1 MVP (entra no backlog fechado)
| Módulo | Incluído no MVP | Justificativa |
|---|---|---|
| Autenticação + tenancy base | Sim | Pré-requisito para isolamento por senhorio (`owner_id`). |
| CRUD de imóveis/unidades/inquilinos/contratos | Sim | Núcleo funcional da operação diária. |
| Geração de rendas/invoices + estados básicos | Sim | Permite cobrança, monitorização de atraso e dashboard financeiro. |
| Registo de pagamentos | Sim | Fecha ciclo financeiro mínimo. |
| Ticket de manutenção com estados base | Sim | Cobre operação e suporte ao inquilino. |
| Dashboard de atenção necessária | Sim | Visibilidade operacional diária. |
| WhatsApp outbound (lembretes/cobrança) | Sim | Ganho rápido de cobrança e comunicação. |

### 2.2 Fase 2 (adiado)
| Módulo | Fora do MVP | Razão do adiamento |
|---|---|---|
| WhatsApp inbound com NLP mais avançado | Sim | Complexidade alta para Sprint inicial. |
| Regras financeiras avançadas (multa, juros dinâmicos) | Sim | Dependência de validação legal e produto. |
| Relatórios avançados e exportações extensas | Sim | Não bloqueia operação do MVP. |
| Automação de reconciliação bancária | Sim | Alto esforço de integração externa. |

### 2.3 Trade-offs principais
- **Trade-off 1:** usar `status` textual inicialmente acelera entrega, mas exige disciplina de convenção para evitar valores inválidos.
- **Trade-off 2:** manter APIs REST simples reduz curva de implementação, mas limita consultas analíticas avançadas até fase posterior.
- **Trade-off 3:** priorizar sem downtime nas migrações reduz risco operacional, ao custo de rollouts em múltiplas etapas.

---

## 3) Contrato base de APIs (input/output/erro)

> Convenções gerais de contrato:
- `Content-Type: application/json` para requisições com body.
- IDs em formato `string`.
- Datas no body em ISO-8601 (ex.: `2026-04-18T00:00:00.000Z`).
- Erro sempre em envelope: `{ "error": "mensagem" }` ou `{ "success": false, "error": "mensagem" }` para rotas WhatsApp.

### 3.1 Tabela de entradas e saídas das APIs principais

| Endpoint | Método | Entrada (body/query/header) | Saída de sucesso | Erros esperados |
|---|---|---|---|---|
| `/api/properties` | `GET` | Sem body | `200` + `Property[]` | `500` falha de leitura |
| `/api/properties` | `POST` | Body: `name`, `addressLine1`, `city`, `region`, `postalCode` (obrigatórios); opcionais: `addressLine2`, `country`, `description` | `201` + `Property` criado | `400` validação; `500` criação |
| `/api/units` | `GET` | Sem body | `200` + `Unit[]` com `property` e `leases` | `500` leitura |
| `/api/units` | `POST` | Body: `propertyId`, `name`, `monthlyRent` obrigatórios; opcionais: `bedrooms`, `bathrooms`, `floor`, `areaSqm`, `status`, `notes` | `201` + `Unit` criado | `400` validação; `404` property inexistente; `500` criação |
| `/api/renters` | `GET` | Sem body | `200` + `Renter[]` | `500` leitura |
| `/api/renters` | `POST` | Body: `fullName` obrigatório; opcionais: `email`, `phone`, `governmentId`, `notes` | `201` + `Renter` criado | `400` validação; `500` criação |
| `/api/leases` | `GET` | Sem body | `200` + `Lease[]` | `500` leitura |
| `/api/leases` | `POST` | Body: `propertyId`, `unitId`, `renterId`, `startDate`, `monthlyRent` obrigatórios; opcionais: `endDate`, `depositAmount`, `dueDay`, `status`, `notes` | `201` + `Lease` criado (inclui property/unit/renter) | `400` validação/consistência; `404` entidades; `500` criação |
| `/api/leases` | `PATCH` | Body: `leaseId` obrigatório; opcionais: `status`, `endDate`, `notes` | `200` + `Lease` atualizado | `400` validação; `404` lease inexistente; `500` update |
| `/api/invoices` | `GET` | Sem body | `200` + `Invoice[]` | `500` leitura |
| `/api/invoices` | `POST` | Body: `leaseId` obrigatório; opcionais: `period`, `amount`, `dueDate`, `status`, `notes` | `201` + `Invoice` criado | `400` leaseId inválido; `500` criação |
| `/api/invoices/generate` | `POST` | Body opcional: `period` | `200` + `{ period, createdCount, created[] }` | `500` geração |
| `/api/payments` | `GET` | Sem body | `200` + `Payment[]` | `500` leitura |
| `/api/payments` | `POST` | Body: `invoiceId` obrigatório; opcionais: `amount`, `paidAt`, `method`, `reference`, `notes` | `201` + `Payment` criado | `400` validação; `404` invoice; `500` criação |
| `/api/maintenance` | `GET` | Sem body | `200` + `MaintenanceTicket[]` | `500` leitura |
| `/api/maintenance` | `POST` | Body: `title` obrigatório; opcionais: `description`, `priority`, `status`, `propertyId`, `unitId` | `201` + `MaintenanceTicket` criado | `400` validação; `500` criação |
| `/api/dashboard` | `GET` | Sem body | `200` + objeto de agregados (`counts`, `finances`, listas recentes) | `500` carga de dashboard |
| `/api/whatsapp/send-invoice` | `POST` | Body: `tenantId`, `invoiceId` obrigatórios | `200` + `{ success: true, detail }` | `400` validação; `404` vínculo inválido; `500` integração |
| `/api/whatsapp/webhook` | `GET` | Query: `hub.mode`, `hub.verify_token`, `hub.challenge` | `200` challenge quando válido | `403` proibido; `500` token ausente |
| `/api/whatsapp/webhook` | `POST` | Header: assinatura `x-hub-signature-256`; body Meta webhook | `200`/`{ success: true }` | `401` assinatura; `403` remetente; `500` processamento |

### 3.2 Regras de autenticação/autorização (baseline Sprint 1)
- **Estado atual:** a maioria dos endpoints ainda não exige sessão de utilizador.
- **Decisão de arquitetura:** todas as rotas de domínio devem evoluir para escopo por `owner_id` na Sprint 2.
- **Regra especial já implementada:** webhook WhatsApp valida assinatura HMAC e opcionalmente `WHATSAPP_ADMIN_NUMBERS` para allowlist.

### 3.3 Casos de erro e mensagens padronizadas
- Erro de validação: `400` com mensagem direta (ex.: `"invoiceId is required"`).
- Recurso não encontrado: `404` (ex.: `"Invoice not found"`).
- Erro interno: `500` com mensagem genérica para não expor detalhes de infra.
- Falha de autenticação de webhook: `401` (`"Invalid webhook signature"`).
- Falha de autorização (allowlist): `403` (`"Unauthorized sender"`).

---

## 4) Convenção de estados (state machine funcional)

### 4.1 Lease
- Estados permitidos: `Draft`, `Active`, `Ended`, `Cancelled`.
- Transições válidas:
  - `Draft -> Active`
  - `Active -> Ended`
  - `Draft -> Cancelled`
  - `Active -> Cancelled` (apenas regra administrativa)
- Regras:
  - `Active` ocupa unidade (`Unit.status = Occupied`).
  - Sem leases ativos na unidade -> `Unit.status = Vacant`.

### 4.2 Rent/Invoice
- Estados permitidos: `Pending`, `Partial`, `Paid`, `Overdue`, `Cancelled`.
- Transições válidas:
  - `Pending -> Partial | Paid | Overdue | Cancelled`
  - `Partial -> Paid | Overdue | Cancelled`
  - `Overdue -> Partial | Paid | Cancelled`
- Regras:
  - `dueDate < now` e não pago: considerar `Overdue` em leitura/rotina.
  - Pagamento total move para `Paid`.

### 4.3 Payment
- Estados operacionais: `Registered`, `Confirmed`, `Rejected`, `Reversed`.
- MVP atual persiste apenas lançamento do pagamento; estado explícito entra como evolução de schema na Sprint 3/6.

### 4.4 Ticket
- Estados permitidos: `Open`, `Triaged`, `Waiting`, `Resolved`, `Closed`.
- Transições válidas:
  - `Open -> Triaged -> Waiting -> Resolved -> Closed`
  - `Resolved -> Waiting` (reabertura)

### 4.5 Reminder
- Estados permitidos: `Scheduled`, `Queued`, `Sent`, `Delivered`, `Failed`, `Cancelled`.
- Regras:
  - Retry permitido apenas em `Failed`.
  - `Cancelled` é terminal.

---

## 5) Estratégia de migrations sem downtime

### 5.1 Princípios
1. **Expand -> Migrate -> Contract** (duas ou três releases).
2. Nunca remover/renomear coluna em mesma release que introduz nova dependência.
3. Backfill idempotente com batches pequenos.
4. Feature flags para alternar leitura entre colunas legada/nova.

### 5.2 Plano padrão por mudança de schema
1. **Expand:** adicionar nova coluna/tabela com `NULL` permitido e índices não bloqueantes.
2. **Deploy A:** aplicação grava em ambos formatos (dual-write).
3. **Backfill:** job em lote para histórico.
4. **Deploy B:** leitura primária do novo formato + monitorização.
5. **Contract:** remover legado em release posterior, com janela de rollback encerrada.

### 5.3 Impacto em dados existentes
- Dados atuais permanecem válidos porque mudanças iniciam como aditivas.
- Backfill deve registrar progresso e permitir retomar sem duplicação.

### 5.4 Plano de rollback
- Durante `Expand`/`Deploy A`: rollback imediato para versão anterior (schema compatível).
- Durante `Deploy B`: reverter leitura para coluna antiga via flag.
- `Contract` só após estabilidade e snapshot de backup válido.

---

## 6) Mudanças de dados previstas no Sprint 1

> Sprint 1 é de arquitetura e contrato. **Não houve alteração de schema aplicada neste sprint.**

- **Schema afetado:** nenhum arquivo alterado em `prisma/schema.prisma`.
- **Migração aplicada:** nenhuma.
- **Impacto em dados existentes:** nenhum impacto direto.
- **Rollback:** não aplicável para dados (apenas rollback de documentação).

---

## 7) Critérios de aceite por módulo

| Módulo | Critérios de aceite Sprint 1 |
|---|---|
| Backlog | Lista fechada de MVP e Fase 2 definida e aprovada. |
| API Contract | Tabela de contratos publicada, incluindo erros e códigos HTTP. |
| Estados de domínio | Convenções e transições definidas para lease/rent/payment/ticket/reminder. |
| Migrações | Estratégia sem downtime documentada (expand/backfill/contract + rollback). |
| Arquitetura v1 | Documento único com decisões, trade-offs e plano de validação. |

---

## 8) Como testar manualmente (passo a passo)

### 8.1 Validar contrato das APIs
1. Iniciar a aplicação: `npm run dev`.
2. Executar chamadas `GET` e `POST` com payload válido (ex.: `/api/properties`, `/api/leases`).
3. Confirmar `status code` e formato de resposta segundo a Tabela 3.1.
4. Repetir com payload inválido e confirmar mensagens de erro.

### 8.2 Validar convenção de estados
1. Criar lease ativo e verificar se unidade passa para `Occupied`.
2. Encerrar lease (`PATCH /api/leases`) e verificar se unidade volta para `Vacant` quando não há ativo.
3. Criar invoice e lançar pagamento parcial e total para confirmar `Partial`/`Paid`.

### 8.3 Validar estratégia de migration
1. Simular alteração aditiva de coluna em branch isolada.
2. Executar dual-write em endpoint afetado.
3. Rodar script de backfill idempotente.
4. Desligar leitura nova via flag para validar rollback lógico.

---

## 9) Testes automatizados executados neste sprint

- `npm run prisma:generate` para validar consistência de client Prisma.
- `npm run build` para validar integridade TypeScript/Next build.

> Evidência de sucesso: `npm run prisma:generate` executou com código de saída 0; `npm run build` falhou por limitação de ambiente ao obter fontes do Google Fonts (`Space Grotesk` e `Fraunces`).

---

## 10) Rastreabilidade de artefatos criados/alterados

### 10.1 Arquivo criado: `docs/ARQUITETURA_V1_SPRINT1.md`
- **Objetivo:** consolidar decisões de arquitetura, contratos, estados, migração e aceite da Sprint 1.
- **Entrada:** contexto do produto + implementação atual das rotas em `app/api`.
- **Saída:** especificação técnica v1 em Markdown.
- **Erros possíveis:** divergência futura com implementação caso rotas mudem sem atualizar documento.
- **Teste:** revisão cruzada de contratos com rotas existentes + build de validação do projeto.


### 10.2 Arquivos alterados na sprint (documentação obrigatória)

#### `CHANGELOG.md`
- **Objetivo:** registrar historicamente as decisões e entregáveis da Sprint 1.
- **Entrada:** resumo factual das alterações realizadas.
- **Saída:** entrada de changelog datada (`2026-04-18`) com escopo/impacto/rollback.
- **Erros possíveis:** omissão de itens obrigatórios de governança.
- **Teste:** conferência manual da presença da nova seção e consistência com os artefatos.

#### `TEMPORAL_CHECKLIST.md`
- **Objetivo:** marcar progresso temporal oficial da semana 1.
- **Entrada:** status de execução das tarefas do Sprint 1.
- **Saída:** checklist da Semana 1 marcado como concluído (`[x]`).
- **Erros possíveis:** marcação indevida de item não entregue.
- **Teste:** validação manual item a item versus este documento.

#### `README.md`
- **Objetivo:** atualizar documentação técnica relacionada com referência para arquitetura v1.
- **Entrada:** nome/caminho do documento técnico criado.
- **Saída:** nova linha em “Governança de Produto” apontando para `docs/ARQUITETURA_V1_SPRINT1.md`.
- **Erros possíveis:** link quebrado/caminho incorreto.
- **Teste:** checagem manual do caminho no repositório.
