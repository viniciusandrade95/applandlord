# Changelog

## 2026-04-18 (Sprint 12 — segurança e estabilidade)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** hardening de validações backend, rate limiting, logs estruturados, drill de backup/restore e revisão de segredos/permissões
- **Descrição:** adicionados utilitários de segurança (`lib/security.ts`) com `ValidationError`, validação forte de email/senha/data e verificação de secrets obrigatórios; implementado rate limiting em memória (`lib/rate-limit.ts`) aplicado em `POST /api/auth/login`, `POST /api/whatsapp/webhook` e `POST /api/jobs/reminders/daily`; criada camada de observabilidade (`lib/observability.ts`) com logs JSON estruturados e redaction de campos sensíveis; rotas críticas atualizadas para respostas padronizadas (400/401/429/500) e `Retry-After`; criado script operacional `scripts/backup-restore-drill.sh` com evidência de restore em `docs/evidence/SPRINT12_RESTORE_EVIDENCE.md`; criada documentação técnica completa em `docs/SPRINT12_HARDENING_REPORT.md` e checklist `docs/SPRINT12_SECURITY_CHECKLIST.md`; atualizado `.env.example`, `TEMPORAL_CHECKLIST.md` (Semana 12 concluída) e `README.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 12 (Dias 56–60), fortalecendo base operacional para QA final e go-live controlado (Semanas 13–14).
- **Risco/rollback:** risco baixo/moderado (sem mudança de schema); rollback por reversão dos arquivos da sprint e desativação dos novos limites/configurações.

## 2026-04-18
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** governança, planejamento e visão de produto
- **Descrição:** adicionados `PRODUCT_CONSTITUTION.md`, `TEMPORAL_CHECKLIST.md` e `CHANGE_GOVERNANCE.md`.
- **Impacto no roadmap:** documentação base para todas as semanas (1–14).
- **Risco/rollback:** sem risco técnico; rollback simples removendo os arquivos.

## 2026-04-18 (atualização 2)
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** prompts de sprint e governança de documentação
- **Descrição:** adicionado `CODEX_SPRINT_PROMPTS.md` com prompts individuais para os 14 sprints; reforçadas regras obrigatórias de documentação de funções, entradas/saídas e testes em `CHANGE_GOVERNANCE.md`; atualizado `TEMPORAL_CHECKLIST.md` e `README.md`.
- **Impacto no roadmap:** melhora execução e rastreabilidade de todas as semanas (1–14).
- **Risco/rollback:** sem risco técnico; rollback removendo/ajustando os documentos.


## 2026-04-18 (Sprint 1 — arquitetura técnica)
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** arquitetura v1, contratos de API, convenção de estados, estratégia de migração e critérios de aceite
- **Descrição:** criado `docs/ARQUITETURA_V1_SPRINT1.md` com backlog MVP vs Fase 2, tabela de contratos das APIs principais, convenção de estados (`lease`, `rent/invoice`, `payment`, `ticket`, `reminder`), estratégia de migrations sem downtime (expand/backfill/contract), critérios de aceite por módulo, plano de testes manuais e evidência de testes automatizados; atualizado `TEMPORAL_CHECKLIST.md` marcando conclusão da Semana 1 e `README.md` com referência da documentação técnica.
- **Impacto no roadmap:** fecha oficialmente os entregáveis da Sprint 1 e reduz retrabalho para as sprints de implementação.
- **Risco/rollback:** sem risco de runtime (mudança documental); rollback simples revertendo os arquivos de documentação.

## 2026-04-18 (Sprint 2 — auth + tenancy base)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** autenticação, sessão, isolamento por owner, migração de dados e documentação técnica
- **Descrição:** implementado fluxo funcional de login/logout (`/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, página `/login` e `middleware.ts`); adicionada camada de sessão assinada em `lib/auth.ts`; introduzido `ownerId` em todas as entidades core com novo model `User`; atualizadas APIs core para exigir sessão e filtrar leitura/escrita por `ownerId`; aplicada migração `prisma/migrations/20260418170000_sprint2_auth_tenancy/migration.sql` com backfill de dados existentes para owner bootstrap; atualizado fluxo WhatsApp para respeitar owner em envio/listagens.
- **Impacto no roadmap:** conclui integralmente a Semana 2 (auth + tenancy base), preparando Sprint 3 para reforço de modelo de dados e constraints.
- **Risco/rollback:** risco moderado em migração de dados (novas FKs e `NOT NULL`); rollback exige remover FKs/índices/colunas `ownerId` e restaurar snapshot pré-migração.

## 2026-04-18 (Sprint 3 — modelo SaaS robusto)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** evolução de schema financeiro/comunicação, constraint de contrato ativo único e trilha de auditoria
- **Descrição:** adicionadas tabelas `Expense`, `Reminder`, `WhatsAppMessage` e `AuditLog`; tabela física de cobranças renomeada de `Invoice` para `rent_charges` com compatibilidade mantida via Prisma `@@map`; criada constraint de 1 contrato ativo por unidade+owner (`Lease_one_active_per_unit_owner_key`); criados índices essenciais de desempenho por owner/status/datas; atualizado backend para registrar eventos críticos em auditoria (`LEASE_CREATED`, `LEASE_UPDATED`, `RENT_CHARGE_CREATED`, `PAYMENT_REGISTERED`); criada documentação técnica `docs/SPRINT3_SAAS_SCHEMA.md` com ER simplificado, matriz de entradas/saídas por tabela, contratos de API alteradas, plano de testes e rollback.
- **Impacto no roadmap:** conclui integralmente a Semana 3, preparando base de dados para fluxos de reminders, WhatsApp outbound/inbound e controles de compliance.
- **Risco/rollback:** risco moderado por DDL estrutural (rename de tabela + novos FKs/índices); rollback estruturado disponível em `prisma/migrations/20260418190000_sprint3_saas_schema/rollback.sql`.

## 2026-04-18 (Sprint 4 — wizard de contratos)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** fluxo guiado de contrato, validações de consistência, criação/seleção de inquilino e documentação técnica
- **Descrição:** implementado wizard em 5 passos no frontend (`app/components/lease-wizard.tsx`) com estados/transições, validações por etapa, tela de confirmação e tela de sucesso; endpoint `POST /api/leases` evoluído para suportar `renterMode` (`existing`/`new`) com criação de inquilino em linha; adicionadas validações de domínio em `lib/lease-wizard.ts` para datas, `dueDay`, consistência imóvel/unidade e unidade ocupada/com contrato ativo; criada suíte automatizada `tests/lease-wizard-validation.test.js`; criada documentação técnica e UX em `docs/SPRINT4_CONTRACT_WIZARD.md`; atualizado checklist temporal da Semana 4 com todos os itens concluídos.
- **Impacto no roadmap:** conclui integralmente a Semana 4 (Dias 16–20) e prepara base para geração automática de rendas na Semana 5.
- **Risco/rollback:** risco baixo (sem migração de schema); rollback por reversão dos arquivos de frontend/backend/documentação adicionados/alterados nesta sprint.

## 2026-04-18 (Sprint 5 — geração automática de rendas + máquina de estados)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** geração automática de cobrança por período, máquina de estados de rent charges, endpoint seguro de transição, logs de transição e documentação técnica
- **Descrição:** criado serviço `generateRentChargesForPeriod` (`lib/rent-generation.ts`) para automatizar criação de cobranças com controle de itens ignorados (`skipped`); evoluído endpoint `POST /api/invoices/generate` para usar serviço e registrar auditoria de batch; implementada máquina de estados em `lib/rent-state-machine.ts` com validação explícita de transições permitidas; criado endpoint protegido `POST /api/invoices/[invoiceId]/transition` para transições seguras por tenant; adicionado modelo/tabela `RentChargeTransitionLog` com migração `prisma/migrations/20260418201000_sprint5_rent_state_machine/migration.sql`; adicionados testes automatizados de transição inválida em `tests/rent-state-machine.test.js`; criada documentação técnica completa em `docs/SPRINT5_RENT_AUTOMATION_STATE_MACHINE.md`; atualizado checklist temporal da Semana 5 com itens concluídos.
- **Impacto no roadmap:** conclui integralmente a Semana 5 (Dias 21–25) e prepara base de cobrança para Sprint 6 (pagamentos/despesas) e Sprint 10/11 (reminders e automações conversacionais).
- **Risco/rollback:** risco moderado por introdução de endpoint de transição e novo schema de log; rollback estruturado via `prisma/migrations/20260418201000_sprint5_rent_state_machine/rollback.sql` e reversão dos handlers/libs da sprint.


## 2026-04-18 (Sprint 6 — núcleo financeiro)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** pagamentos com confirmação manual, comprovativo opcional, CRUD de despesas, lucro líquido e contratos financeiros de API
- **Descrição:** fluxo de pagamento evoluído para `AwaitingConfirmation` com comprovativo opcional (`receiptUrl`) e confirmação final manual via `POST /api/payments/:paymentId/confirm`; adicionados campos de confirmação em `Payment` com migração `prisma/migrations/20260418220000_sprint6_financial_core/migration.sql`; criada API completa de despesas (`GET/POST /api/expenses`, `PATCH/DELETE /api/expenses/:expenseId`) com isolamento por owner e auditoria; dashboard financeiro atualizado para receita confirmada, despesas mensais, lucro líquido e contagem de pendentes de confirmação; adicionados testes de regras de confirmação e transições atualizadas de máquina de estados; criada documentação técnica `docs/SPRINT6_FINANCIAL_CORE.md` e contratos detalhados em `docs/FINANCIAL_API_CONTRACTS.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 6 (Dias 26–30), fechando o núcleo financeiro para preparar Semana 7 (dashboard “atenção necessária”).
- **Risco/rollback:** risco moderado por alteração de schema e novo fluxo transacional de confirmação; rollback disponível em `prisma/migrations/20260418220000_sprint6_financial_core/rollback.sql`.

## 2026-04-18 (Sprint 7 — dashboard acionável de atenção diária)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** dashboard operacional, priorização diária, KPIs acionáveis, consistência visual e documentação técnica
- **Descrição:** endpoint `GET /api/dashboard` evoluído com modelo `attention` (resumo humano, ações rápidas, atenção por prioridade e 8 KPIs); criado service puro `buildDashboardAttentionModel` em `lib/dashboard-attention.ts`; frontend (`app/page.tsx`) revisado com blocos acionáveis e fallbacks explícitos de UI; aplicada camada visual semântica (`state-critical`, `state-warning`, `state-healthy`, `state-info`) em `app/globals.css`; criado documento de mapeamento KPI->ação (`docs/KPI_ACTION_MAPPING.md`) e documentação técnica completa da sprint (`docs/SPRINT7_ACTIONABLE_DASHBOARD.md`); adicionados testes automatizados do modelo de dados/rendering (`tests/dashboard-attention-model.test.js`).
- **Impacto no roadmap:** conclui integralmente a Semana 7 (Dias 31–35), preparando Semana 8 para refinamento de foco UX e microcopy.
- **Risco/rollback:** risco baixo/moderado (alteração de payload de dashboard e renderização); rollback por reversão dos arquivos da sprint, sem rollback de schema.


## 2026-04-18 (Sprint 9 — tickets operacionais com rastreabilidade)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** módulo de tickets no painel, máquina formal de estados, timeline de eventos, vínculos ticket->imóvel/unidade/contrato/inquilino, filtros por prioridade/estado e documentação técnica
- **Descrição:** implementadas rotas `GET/POST /api/tickets`, `PATCH /api/tickets/:ticketId`, `GET/POST /api/tickets/:ticketId/events`; endpoint legado `/api/maintenance` atualizado para estados formais e criação de timeline; criada máquina de estados em `lib/ticket-state-machine.ts`; painel (`app/page.tsx`) evoluído com criação e gestão de tickets, filtros e timeline visual; schema evoluído com novos campos em `MaintenanceTicket` e nova tabela `TicketEvent` via migração `prisma/migrations/20260418235000_sprint9_ticket_workflow/migration.sql`; adicionados testes `tests/ticket-flow.test.js`; criada documentação `docs/TICKET_STATE_MACHINE.md` e `docs/SPRINT9_TICKETS_OPERATIONS.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 9 (Dias 41–45), preparando automações de comunicação das Semanas 10 e 11 com base em tickets rastreáveis.
- **Risco/rollback:** risco moderado por mudança de schema + novas rotas; rollback estruturado em `prisma/migrations/20260418235000_sprint9_ticket_workflow/rollback.sql`.
## 2026-04-18 (Sprint 8 — UX de foco e microcopy)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** clareza de linguagem, hierarquia de CTA, empty states acionáveis, mensagens de feedback e consistência visual de demo
- **Descrição:** frontend principal (`app/page.tsx`) ajustado para reforçar 1 CTA primário por ecrã (hero com ação principal + link secundário), revisão de microcopy para contexto de senhorio, novos empty states orientados à ação em todas as listas, padronização de mensagens de erro/sucesso com fallback legível (`apiErrorMessage`) e melhoria de feedback no fluxo de WhatsApp; wizard de contratos (`app/components/lease-wizard.tsx`) recebeu mensagens de validação/sucesso mais claras; CSS (`app/globals.css`) ganhou classe `.inline-link` e refinamento visual de blocos vazios; criada documentação técnica da sprint (`docs/SPRINT8_UX_MICROCOPY.md`) e guia dedicado (`docs/MICROCOPY_GUIDE_V1.md`); checklist temporal atualizado com Semana 8 concluída.
- **Impacto no roadmap:** conclui integralmente a Semana 8 (Dias 36–40), preparando as próximas sprints com base de UX mais clara para demo e operações.
- **Risco/rollback:** risco baixo (sem mudança de schema nem contratos backend); rollback via reversão dos arquivos de UI/documentação da sprint.

## 2026-04-18 (Sprint 11 — WhatsApp inbound inquilino)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** fluxo inbound de inquilino, parser de intenção, deduplicação/throttling, vínculo telefone->contrato e rastreabilidade operacional
- **Descrição:** webhook `POST /api/whatsapp/webhook` atualizado para separar fluxo admin e fluxo de inquilino; criado service `lib/tenant-inbound.ts` com parser de intenção (`tenant_claimed_paid`, `tenant_problem_reported`, `tenant_promised_tomorrow`), resolução de contexto por telefone, anti-duplicação por `dedupeKey` e throttling por janela; aplicada atualização de estado de cobrança para `AwaitingConfirmation` quando inquilino declara pagamento; criada abertura automática de tickets por palavras-chave; adicionada tabela `WhatsAppInboundEvent` via migração `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/migration.sql`; incluídos testes automatizados de idempotência e concorrência (`tests/tenant-inbound-idempotency.test.js`) e documentação técnica completa em `docs/SPRINT11_WHATSAPP_INBOUND.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 11 (Dias 51–55) com fluxo inbound funcional e rastreável.
- **Risco/rollback:** risco moderado (nova tabela e novo caminho transacional no webhook); rollback estruturado em `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/rollback.sql`.
## 2026-04-18 (Sprint 10 — WhatsApp outbound real)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** templates de cobrança, job diário de reminders, retry básico, persistência de mensagens/status e integração do botão “Cobrar agora”.
- **Descrição:** criado módulo de templates (`lib/whatsapp-templates.ts`) para lembrete/atraso/cobrança manual/confirmação; implementado serviço outbound (`lib/whatsapp-reminders.ts`) com criação de reminders, despacho com persistência em `WhatsAppMessage`, retry com `RetryScheduled` até 3 tentativas e logs operacionais; criado endpoint de job `POST /api/jobs/reminders/daily` com segredo dedicado; fluxo manual `POST /api/whatsapp/send-invoice` passou a usar o mesmo dispatcher (retornando `reminderId` e `providerMessageId`); adicionada cobertura automatizada de regras de template/retry em `tests/whatsapp-reminder-flow.test.js`; documentação técnica completa criada em `docs/SPRINT10_WHATSAPP_OUTBOUND.md` e `docs/WHATSAPP_PAYLOADS_SPRINT10.md`; checklist temporal da Semana 10 marcado como concluído.
- **Impacto no roadmap:** conclui integralmente a Semana 10 (Dias 46–50), preparando a Semana 11 para inbound WhatsApp com base em outbound rastreável e resiliente.
- **Risco/rollback:** risco moderado por nova automação e chamadas externas; rollback por desativação do job + reversão dos módulos/rotas da sprint (sem DDL).
