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
