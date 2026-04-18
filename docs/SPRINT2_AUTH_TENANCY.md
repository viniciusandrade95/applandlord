# Sprint 2 — Auth + isolamento por conta (`owner_id`)

Data: 2026-04-18.

## 1) Objetivo da sprint
Implementar autenticação com sessão HTTP, proteção das rotas de API e isolamento multi-tenant por proprietário (`ownerId`) nas entidades core.

---

## 2) Mudanças de dados

### 2.1 Schema afetado
- Novo model `User`.
- Novas colunas obrigatórias `ownerId` em:
  - `Property`, `Unit`, `Renter`, `Lease`, `Invoice`, `Payment`, `MaintenanceTicket`.
- Novas FKs `ownerId -> User.id` em todas as entidades acima.
- Novos índices `*_ownerId_idx` para filtro por tenant.

### 2.2 Migração aplicada
Arquivo: `prisma/migrations/20260418170000_sprint2_auth_tenancy/migration.sql`.

Estratégia aplicada:
1. Expand: cria tabela `User` e adiciona `ownerId` como nullable.
2. Backfill: cria owner bootstrap (`owner@applandlord.local`) e preenche `ownerId` legado.
3. Contract: marca `ownerId` como `NOT NULL`, cria índices e FKs.

### 2.3 Impacto em dados existentes
- Todos os registros legados são atribuídos ao owner bootstrap.
- Após o primeiro login desse owner, a senha bootstrap é substituída por hash válido.
- Sem perda de dados; apenas enriquecimento de tenancy.

### 2.4 Plano de rollback
- Rollback de aplicação: possível enquanto colunas antigas e novas coexistem.
- Rollback de schema após `NOT NULL`/FK exige:
  1) remover constraints FK,
  2) remover índices `ownerId`,
  3) permitir `ownerId NULL` e (opcional) remover colunas,
  4) remover tabela `User` apenas se não houver referência.
- Para rollback seguro: snapshot DB antes de aplicar migration.

---

## 3) Auth implementada

### 3.1 Fluxo login/logout funcional
- `POST /api/auth/login`:
  - valida `email` e `password` (min 6 chars).
  - cria usuário automaticamente se não existir (bootstrap simples para MVP).
  - define cookie `applandlord_session` (HTTP-only).
- `POST /api/auth/logout`:
  - expira cookie de sessão.
- `GET /api/auth/session`:
  - retorna usuário autenticado.

### 3.2 Proteção de rotas
- `middleware.ts` bloqueia acesso sem cookie para:
  - páginas (redireciona para `/login`),
  - APIs (retorna `401`).
- Camada de rota usa `requireCurrentUserId()` para validação forte de sessão assinada.

### 3.3 Isolamento por owner
- Todas as rotas core filtram por `ownerId` em leitura.
- Todas as escritas persistem `ownerId` = usuário autenticado.
- Validações de relacionamento (`propertyId`, `unitId`, `renterId`, `invoiceId`) também restringem owner.

---

## 4) Documento de autorização por endpoint

| Endpoint | Auth | Regra de autorização |
|---|---|---|
| `POST /api/auth/login` | Pública | Sem sessão; cria/autentica usuário por email/senha. |
| `POST /api/auth/logout` | Opcional | Limpa cookie local. |
| `GET /api/auth/session` | Sessão | Retorna contexto do usuário atual. |
| `GET/POST /api/properties` | Sessão obrigatória | Só lê/cria registros com `ownerId` do usuário atual. |
| `GET/POST /api/units` | Sessão obrigatória | Só opera em unidades do owner atual e em `property` do mesmo owner. |
| `GET/POST/PATCH /api/leases` | Sessão obrigatória | Só opera leases do owner atual; cruza `property`, `unit`, `renter` com mesmo owner. |
| `GET/POST /api/renters` | Sessão obrigatória | Isolado por `ownerId`. |
| `GET/POST /api/invoices` | Sessão obrigatória | Só em leases do owner atual; grava `ownerId`. |
| `POST /api/invoices/generate` | Sessão obrigatória | Gera apenas para leases ativas do owner atual. |
| `GET/POST /api/payments` | Sessão obrigatória | Só em invoices do owner atual; grava `ownerId`. |
| `GET/POST /api/maintenance` | Sessão obrigatória | Isolado por owner no CRUD. |
| `GET /api/dashboard` | Sessão obrigatória | Agregados filtrados por owner. |
| `POST /api/whatsapp/send-invoice` | Sessão obrigatória | Busca invoice por `id + ownerId`; impede envio entre contas. |
| `GET/POST /api/whatsapp/webhook` | Pública | Mantida pública para Meta webhook; proteção via assinatura HMAC/allowlist admin. |

---

## 5) Contrato de endpoints alterados (request/response + exemplos)

### 5.1 `POST /api/auth/login`
**Request body:**
```json
{ "email": "owner@example.com", "password": "secret123" }
```
**Responses:**
- `200`: `{ "id": "...", "email": "owner@example.com", "name": "owner" }` + cookie de sessão.
- `400`: `{ "error": "email and password (min 6 chars) are required" }`
- `401`: `{ "error": "Invalid credentials" }`

### 5.2 `POST /api/auth/logout`
**Request:** sem body.
**Responses:**
- `200`: `{ "success": true }` e expiração de cookie.

### 5.3 `GET /api/auth/session`
**Responses:**
- `200`: `{ "authenticated": true, "user": { "id": "...", "email": "..." } }`
- `401`: `{ "authenticated": false }`

### 5.4 Endpoints core protegidos
Headers exigidos para testes reais:
```http
Cookie: applandlord_session=<token>
Content-Type: application/json
```

Exemplo real (`POST /api/properties`):
```json
{ "name": "Edifício Atlântico", "addressLine1": "Rua A, 10", "city": "Porto", "region": "Porto", "postalCode": "4000-100" }
```
Resposta sucesso:
```json
{ "id": "...", "ownerId": "...", "name": "Edifício Atlântico", "city": "Porto" }
```
Erros:
- `401`: `{ "error": "Unauthorized" }`
- `400`: validação de campos obrigatórios

---

## 6) Funções criadas/alteradas (objetivo, entrada, saída, erros, efeitos colaterais)

## `lib/auth.ts`
- `createSessionToken(userId)`
  - Objetivo: gerar token assinado de sessão.
  - Entrada: `userId: string` (não vazio).
  - Saída: `string` (`<payload>.<hmac>`).
  - Erros: lança se `AUTH_SECRET` ausente.
  - Efeito colateral: nenhum.
- `verifySessionToken(token)`
  - Objetivo: validar assinatura/expiração.
  - Entrada: `token?: string`.
  - Saída: `{ userId, exp } | null`.
  - Erros: não lança em token inválido; retorna `null`.
  - Efeito colateral: nenhum.
- `getCurrentUserId()` / `requireCurrentUserId()`
  - Objetivo: extrair usuário autenticado do cookie.
  - Entrada: cookie HTTP `applandlord_session`.
  - Saída: `userId` ou resposta `401`.
  - Erros: sessão ausente/inválida -> não autenticado.
  - Efeito colateral: leitura de cookie.
- `setSessionCookie(response, userId)` / `clearSessionCookie(response)`
  - Objetivo: criar/remover sessão HTTP-only.
  - Efeitos colaterais: mutação de headers de resposta.
- `hashPassword(password)` / `verifyPassword(password, storedHash)`
  - Objetivo: hash e validação via `scrypt`.
  - Validação: senha mínima aplicada no endpoint (>=6).
- `authenticateWithPassword(email, password)`
  - Objetivo: autenticar ou auto-provisionar usuário.
  - Entrada: email normalizado e senha.
  - Saída: `User | null`.
  - Erros: retorno `null` para credencial inválida.
  - Efeito colateral: `INSERT/UPDATE` em `User`.

## Rotas auth
- `POST login`: cria sessão (cookie), possível criação de usuário.
- `POST logout`: remove sessão.
- `GET session`: resolve usuário atual.

## Rotas core alteradas
- Todas as funções `GET/POST/PATCH` em `properties`, `units`, `renters`, `leases`, `invoices`, `invoices/generate`, `payments`, `maintenance`, `dashboard`, `whatsapp/send-invoice` agora:
  - validam sessão (`requireCurrentUserId`),
  - filtram `where: { ownerId: userId }` em leitura,
  - persistem `ownerId` em criação,
  - retornam `401` em ausência de sessão.
- Efeitos colaterais relevantes:
  - escrita em entidades core,
  - atualização de `Unit.status` em fluxo de lease,
  - envio externo WhatsApp em `send-invoice`.

## `lib/whatsapp-invoice.ts` / `lib/whatsapp-menu.ts`
- `getInvoiceForWhatsApp(invoiceId, ownerId)` e `sendInvoiceWhatsApp(invoiceId, ownerId, renterId?)`
  - agora impedem acesso cross-owner.
- `getWhatsappOwnerId()` no menu webhook
  - resolve owner por `WHATSAPP_OWNER_EMAIL` (fallback bootstrap) para operações de menu.

---

## 7) Como testar manualmente (passo a passo)

1. Definir `AUTH_SECRET` no `.env`.
2. Aplicar schema/migration e gerar client.
3. Abrir `/login`.
4. Fazer login com email novo (auto-criação) + senha >= 6.
5. Confirmar redirecionamento para `/`.
6. Criar propriedade, unidade, inquilino, lease, invoice, payment.
7. Abrir devtools/network e confirmar `401` ao remover cookie manualmente.
8. Executar `POST /api/auth/logout` e validar redirecionamento para `/login`.
9. Validar que dashboard e listas retornam apenas dados do owner logado.
10. (Opcional) criar segundo usuário e confirmar isolamento entre contas.

---

## 8) Testes automatizados executados + evidência

- `npm run prisma:generate` ✅ (sucesso, Prisma Client gerado).
- `npm run build` ⚠️ falhou por limitação de rede ao baixar Google Fonts (`Fraunces`, `Space Grotesk`), sem erro de tipagem reportado antes da etapa de fetch.

