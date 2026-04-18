# Changelog

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
