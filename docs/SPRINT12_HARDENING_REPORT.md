# Sprint 12 — Relatório de Hardening (Segurança e Estabilidade)

## 1) Escopo executado

Objetivo da sprint: endurecer segurança e estabilidade operacional com foco em:
1. validações backend;
2. rate limits;
3. logs estruturados de erro;
4. teste de backup/restore;
5. revisão de permissões e segredos.

## 2) Funções criadas/alteradas (segurança e observabilidade)

## `lib/security.ts`

### `ValidationError`
- **Objetivo:** erro de domínio para validação com `status` HTTP e `details` estruturado.
- **Entrada:** `message: string`, `details?: Record<string, unknown>`, `status?: number`.
- **Saída:** instância de erro com campos serializáveis para API.
- **Erros possíveis:** não aplica (objeto utilitário).
- **Efeitos colaterais:** nenhum.

### `validateEmail(email: string)`
- **Objetivo:** validar formato e normalizar email para lowercase/trim.
- **Entrada:** string de email.
  - validações: obrigatório, regex básica, tamanho máximo 254.
  - exemplo válido: `"owner@example.com"`.
  - exemplo inválido: `"ownerexample.com"`.
- **Saída:** email normalizado (`string`).
- **Erros possíveis:** `ValidationError` (`400`) para ausência/formato/tamanho inválido.
- **Efeitos colaterais:** nenhum.

### `validatePassword(password: string)`
- **Objetivo:** reforçar senha mínima para autenticação.
- **Entrada:** string de senha.
  - validações: mínimo 10 chars, contém letras e números.
  - exemplo válido: `"abcde12345"`.
- **Saída:** senha original (`string`) quando válida.
- **Erros possíveis:** `ValidationError` (`400`) para tamanho/complexidade insuficiente.
- **Efeitos colaterais:** nenhum.

### `validateIsoDate(value: unknown, fieldName: string)`
- **Objetivo:** validar datas recebidas por API de job.
- **Entrada:** `value` e nome do campo.
  - validações: string não vazia, parse válido de `Date`.
- **Saída:** `Date`.
- **Erros possíveis:** `ValidationError` (`400`) para formato inválido.
- **Efeitos colaterais:** nenhum.

### `assertBearerSecret(request, headerName, expectedSecret)`
- **Objetivo:** autenticar chamadas técnicas por header secreto.
- **Entrada:** `Request`, nome do header, segredo esperado.
- **Saída:** sem retorno (void).
- **Erros possíveis:** `ValidationError` (`401`) para header ausente/inválido.
- **Efeitos colaterais:** nenhum.

### `assertRequiredSecrets(keys: string[])`
- **Objetivo:** fail-fast quando variáveis críticas não existem.
- **Entrada:** lista de chaves de ambiente.
- **Saída:** sem retorno (void).
- **Erros possíveis:** `Error` com lista de secrets ausentes.
- **Efeitos colaterais:** nenhum.

## `lib/rate-limit.ts`

### `enforceRateLimit(request, keyPrefix, limit, windowMs)`
- **Objetivo:** proteção contra abuso por IP em endpoints críticos.
- **Entrada:** request, prefixo lógico, limite e janela em ms.
  - exemplo: login `10 req / 60s`.
- **Saída:** `{ allowed, remaining, retryAfterSeconds }`.
- **Erros possíveis:** não lança erro por design.
- **Efeitos colaterais:** escrita em memória (`Map`) do processo Node.

### `clearRateLimitBuckets()`
- **Objetivo:** limpar estado para testes.
- **Entrada:** nenhuma.
- **Saída:** void.
- **Erros possíveis:** nenhum.
- **Efeitos colaterais:** zera buckets em memória.

## `lib/observability.ts`

### `logStructured(log)`
- **Objetivo:** padronizar logs JSON e redigir dados sensíveis.
- **Entrada:** `StructuredLog` (`level`, `event`, `message`, `context`).
- **Saída:** void.
- **Erros possíveis:** nenhum.
- **Efeitos colaterais:** grava em `console.log/warn/error`.

### `toErrorMessage(error, fallback)`
- **Objetivo:** extrair mensagem segura e previsível de erro.
- **Entrada:** `unknown`, `fallback`.
- **Saída:** string.
- **Erros possíveis:** nenhum.
- **Efeitos colaterais:** nenhum.

## 3) Endpoints alterados

## `POST /api/auth/login`
- **Contrato de entrada:**
  - body JSON: `{ email: string, password: string }`.
- **Contrato de saída:**
  - `200`: `{ id, email, name }` + cookie de sessão.
  - `400`: erro de validação (`ValidationError`).
  - `401`: credenciais inválidas.
  - `429`: excesso de tentativas (header `Retry-After`).
  - `500`: erro interno.
- **Autenticação/autorização:** endpoint público (pré-login), protegido por validação forte + rate limit.
- **Casos de erro e mensagens:**
  - `Invalid email format`
  - `Password must have at least 10 characters`
  - `Too many login attempts. Try again later.`

## `POST /api/whatsapp/webhook`
- **Contrato de entrada:**
  - headers: `x-hub-signature-256` (ou `x-hub-signature`), opcional `x-forwarded-for`.
  - body: payload webhook da Meta.
- **Contrato de saída:**
  - `200`: `{ success: true }` ou `{ success: true, ignored: true|throttled: true }`.
  - `401`: assinatura inválida.
  - `403`: sender não autorizado.
  - `429`: limite de requests por IP.
  - `500`: segredo ausente ou erro interno.
- **Autenticação/autorização:** validação HMAC + allow-list de admins (`WHATSAPP_ADMIN_NUMBERS`).
- **Casos de erro e mensagens:**
  - `Invalid webhook signature`
  - `Unauthorized sender`
  - `Webhook rate limit exceeded`

## `POST /api/jobs/reminders/daily`
- **Contrato de entrada:**
  - headers: `x-reminder-job-secret` obrigatório.
  - body opcional: `{ referenceDate?: string(ISO) }`.
- **Contrato de saída:**
  - `200`: `{ success: true, summary }`.
  - `400`: data inválida.
  - `401`: segredo ausente/inválido.
  - `429`: limite excedido.
  - `500`: falha interna.
- **Autenticação/autorização:** segredo técnico obrigatório + check de segredo configurado no ambiente.
- **Casos de erro e mensagens:**
  - `Missing x-reminder-job-secret header`
  - `Invalid x-reminder-job-secret header`
  - `referenceDate must be a valid date`

## 4) Mudanças de dados
- **Schema afetado:** sem alteração de schema Prisma nesta sprint.
- **Migração aplicada:** não aplicável.
- **Impacto em dados existentes:** zero.
- **Plano de rollback:** rollback por reversão de código (git revert do commit da sprint), sem DDL.

## 5) Backup e restore (teste operacional)

- Script criado: `scripts/backup-restore-drill.sh`.
- Fluxo:
  1. gera snapshot JSON representando estado de dados;
  2. cria backup comprimido (`.gz`);
  3. restaura arquivo;
  4. valida checksum (`sha256`) entre original e restaurado.
- Resultado esperado: checksums idênticos e retorno `Restore drill OK`.

> Evidência detalhada em `docs/evidence/SPRINT12_RESTORE_EVIDENCE.md`.

## 6) Revisão de permissões e segredos
- `.env.example` atualizado com `AUTH_SECRET` obrigatório.
- Verificação de secrets críticos em runtime (`assertRequiredSecrets`) para:
  - `WHATSAPP_WEBHOOK_SECRET`
  - `REMINDER_JOB_SECRET`
- Redação de dados sensíveis em logs estruturados (`token`, `secret`, `password`, `authorization`).

## 7) Como testar manualmente (passo a passo)

1. **Login rate limit**
   - Enviar múltiplos `POST /api/auth/login` (>=11 em 60s do mesmo IP).
   - Esperado: `429` com `Retry-After`.
2. **Login validação forte**
   - Enviar email inválido e senha curta.
   - Esperado: `400` com mensagem de validação.
3. **Webhook assinatura**
   - Chamar `POST /api/whatsapp/webhook` com assinatura inválida.
   - Esperado: `401`.
4. **Reminder job segredo**
   - Chamar `POST /api/jobs/reminders/daily` sem `x-reminder-job-secret`.
   - Esperado: `401`.
5. **Reminder job data inválida**
   - Body `{ "referenceDate": "not-a-date" }` com header correto.
   - Esperado: `400`.
6. **Restore drill**
   - Executar `./scripts/backup-restore-drill.sh`.
   - Esperado: `Restore drill OK` + hash.

## 8) Testes automatizados executados
- `node --test tests/security-hardening.test.js`
- `node --test tests/whatsapp-reminder-flow.test.js`
- `npx tsc --noEmit`
- `./scripts/backup-restore-drill.sh`

## 9) Evidência de sucesso
- Testes e comandos acima registrados no log de execução da sprint.
- Evidência específica de restore em `docs/evidence/SPRINT12_RESTORE_EVIDENCE.md`.
