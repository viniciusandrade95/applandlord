# Sprint 13 — QA Final + UAT

**Data:** 2026-04-18  
**Objetivo:** fechar qualidade para apresentação e uso real inicial.

## 1) Escopo validado

### Fluxos críticos E2E (6)
1. Criação de contrato via wizard (dados + validações de agenda e relações).
2. Fluxo de cobrança (`Pending -> AwaitingConfirmation -> Paid`) com validação de pagamento.
3. Fluxo operacional de ticket (`New -> Triaged -> Waiting -> Resolved -> Closed`).
4. Reminder WhatsApp para renda em atraso e política de retry.
5. Webhook inbound do inquilino com idempotência (duplicidade bloqueada).
6. Bloqueio de regressão inválida de estado (`Paid -> Pending`).

### Edge cases (manuais)
- `dueDay` fora do intervalo aceito (1..28).
- Ticket com regressão de estado inválida.
- `receiptUrl` inválida (não-http/https).
- Mensagem inbound duplicada no mesmo `ownerId` + `dedupeKey`.
- Build de produção com verificação de integridade de frontend.

---

## 2) Evidência de execução dos testes

### 2.1 Testes automatizados

- **Comando:** `node --test tests/e2e-critical-flows.test.js`
- **Resultado real:** 6/6 testes aprovados (fluxos críticos).

- **Comando:** `node --test tests/*.test.js`
- **Resultado real:** 40/40 testes aprovados (inclui regressão + e2e sprint 13).

### 2.2 Testes manuais de edge cases (documentados)

| ID | Cenário | Entrada | Saída esperada | Resultado real |
|---|---|---|---|---|
| EC-01 | Dia de vencimento inválido | `dueDay=31` | Erro de validação informando limite 1..28 | **Passou** — erro: `O dia de vencimento deve estar entre 1 e 28.` |
| EC-02 | Regressão inválida ticket | `Closed -> Waiting` | Bloquear transição | **Passou** — transição inválida rejeitada |
| EC-03 | Comprovativo inválido | `receiptUrl="ftp://arquivo"` | Rejeitar payload | **Passou** — erro: `receiptUrl must start with http:// or https://` |
| EC-04 | Duplicação inbound WhatsApp | mesmo `ownerId + dedupeKey` | 2ª mensagem marcada como duplicada | **Passou** — retorno `duplicate=true` |
| EC-05 | Integridade de compilação frontend | `npm run build` | Build sem erro de parser JSX | **Passou parcialmente** — parser JSX corrigido; build ainda depende de fetch de Google Fonts no ambiente |

---

## 3) Bugs P0/P1 corrigidos e pendências

## Corrigidos

### BUG-P0-001 — JSX inválido na secção Operação (`app/page.tsx`)
- **Severidade:** P0 (quebra de build).
- **Sintoma:** `Unterminated regexp literal` no `next build`.
- **Causa raiz:** bloco de `Panel` e `RecordList` duplicado/mesclado durante evolução da UI.
- **Correção aplicada:** removida duplicação e normalizada a estrutura JSX da área de tickets.
- **Validação:** parser JSX deixou de falhar; execução de testes segue verde.

## Pendências abertas

- **P1-REL-001 — Build offline com Google Fonts externas**
  - **Status:** pendente (não bloqueia QA funcional, mas impacta build em ambiente sem acesso externo).
  - **Impacto:** `next/font` falha ao buscar `Fraunces` e `Space Grotesk` quando a rede bloqueia `fonts.googleapis.com`.
  - **Recomendação para Sprint 14:** migrar para fontes locais (`next/font/local`) para build determinístico.

---

## 4) Script de seed para demo

Implementado script dedicado para gerar base de demo consistente:

- **Arquivo:** `prisma/seed-demo.js`
- **Comando:** `npm run db:seed:demo`
- **Dados criados:**
  - 1 utilizador demo (`demo@applandlord.local`)
  - 1 imóvel, 2 unidades
  - 1 inquilino + 1 contrato ativo
  - 2 cobranças (1 paga, 1 em atraso)
  - 1 pagamento confirmado
  - 1 reminder WhatsApp + 1 mensagem outbound
  - 1 ticket de manutenção + 1 evento de timeline
  - 1 despesa operacional

## 5) Checklist de release (Sprint 13)

- [x] Fluxos críticos E2E executados
- [x] Edge cases manuais executados
- [x] Bugs P0/P1 avaliados e corrigidos quando aplicável
- [x] Seed de demo consistente criado
- [x] Evidência de execução documentada
- [x] CHANGELOG atualizado
- [x] TEMPORAL_CHECKLIST atualizado

## 6) Conclusão UAT

A aplicação está pronta para **apresentação comercial e uso inicial controlado**, com cobertura dos fluxos críticos e correção do bug P0 de frontend. Permanece apenas pendência P1 de robustez de build offline (fontes externas), recomendada para fechamento na Sprint 14.
