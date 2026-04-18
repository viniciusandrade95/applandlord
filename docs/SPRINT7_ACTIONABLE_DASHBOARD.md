# Sprint 7 — Dashboard “Atenção necessária”

Data: 2026-04-18

## Objetivo da sprint
Transformar o dashboard do MVP em um painel de execução diária com foco explícito em decisão e ação imediata:
1. Resumo humano do dia;
2. Bloco de ações rápidas;
3. Bloco de atenção por prioridade;
4. 6–8 KPIs acionáveis;
5. Cores e estados consistentes.

---

## Fontes de dados, entradas, saídas e fallback de UI

## Fontes de dados
- `/api/dashboard` (agregador principal)
  - tabelas Prisma consultadas: `Property`, `Unit`, `Renter`, `Lease`, `Invoice`, `Payment`, `Expense`, `MaintenanceTicket`.

## Entradas (backend)
- Sessão autenticada (`ownerId`) obrigatória.
- Agregados operacionais/financeiros + contagens adicionais da sprint:
  - `dueTodayInvoices`;
  - `urgentMaintenance`;
  - `expiringLeasesIn7Days`.

## Saídas (backend)
- `counts` (operação),
- `finances` (financeiro mensal),
- `attention` (novo modelo para renderização acionável),
- `recentPayments`, `recentInvoices`.

## Fallback de UI (frontend)
- Sem `attention.daySummary`: exibe texto neutro orientado a carregamento.
- Sem `attention.quickActions`: exibe “Sem ações rápidas disponíveis (fallback de UI)”.
- Sem itens em prioridade: exibe “Sem itens nesta prioridade.”.
- Sem `attention.kpis`: exibe “Sem KPIs disponíveis (fallback de UI)”.
- Valores inválidos são normalizados para zero no model builder.

---

## Mudanças de dados

### Schema afetado
- Nenhuma alteração de schema nesta sprint.

### Migração aplicada
- Nenhuma migração nova aplicada.

### Impacto em dados existentes
- Sem impacto estrutural em dados existentes; apenas nova camada de agregação/visualização.

### Plano de rollback
- Reverter arquivos da sprint (`app/api/dashboard/route.ts`, `lib/dashboard-attention.ts`, `app/page.tsx`, `app/globals.css`, testes/docs).
- Sem necessidade de rollback de banco.

---

## Funções criadas/alteradas

## `lib/dashboard-attention.ts`

### `buildDashboardAttentionModel(input)`
- **Objetivo da função:** compor o payload acionável do dashboard (resumo, ações rápidas, prioridades e 8 KPIs).
- **Parâmetros de entrada:**
  - `input.counts: DashboardCounts`
    - campos: `properties`, `units`, `occupiedUnits`, `vacantUnits`, `renters`, `leases`, `activeLeases`, `overdueInvoices`, `openMaintenance`.
    - validação: campos não numéricos são tratados como `0`.
    - exemplo:
      ```json
      { "overdueInvoices": 3, "vacantUnits": 2, "openMaintenance": 4 }
      ```
  - `input.finances: DashboardFinances`
    - campos: `monthlyConfirmedPayments`, `monthlyExpenses`, `monthlyNetProfit`, `openInvoices`, `awaitingConfirmation`, `collectionRate`.
    - validação: campos não numéricos são tratados como `0`.
    - exemplo:
      ```json
      { "monthlyNetProfit": 7000, "awaitingConfirmation": 2, "collectionRate": 80 }
      ```
  - `input.dueTodayInvoices: number`.
  - `input.urgentMaintenance: number`.
  - `input.expiringLeasesIn7Days: number`.
- **Saída:** `DashboardAttentionModel`.
  - formato:
    - `daySummary` (texto humano + highlights),
    - `quickActions[5]`,
    - `attentionByPriority.{high,medium,low}`,
    - `kpis[8]` com `status` e `actionLabel`.
  - exemplo reduzido:
    ```json
    {
      "daySummary": { "title": "Hoje há 2 prioridades críticas..." },
      "quickActions": [{ "id": "quick-charge-overdue", "tone": "critical" }],
      "kpis": [{ "id": "kpi-overdue", "status": "critical", "value": 3 }]
    }
    ```
- **Erros possíveis e comportamento esperado:**
  - não lança exceção; comportamento resiliente com fallback para zeros e bloco neutro quando não há pendências.
- **Efeitos colaterais (DB/chamadas externas/jobs):**
  - nenhum (função pura, sem IO).

## `app/api/dashboard/route.ts`

### `GET /api/dashboard` (alterada)
- **Objetivo da função:** devolver dados operacionais + financeiros + modelo de atenção diária para renderização da dashboard acionável.
- **Parâmetros de entrada:**
  - sem body/query;
  - requer cookie/sessão válida.
- **Saída:** JSON com `counts`, `finances`, `attention`, `recentPayments`, `recentInvoices`.
- **Erros possíveis e comportamento esperado:**
  - `401` quando sessão ausente/inválida;
  - `500` com `{ "error": "Failed to load dashboard" }` em falha inesperada.
- **Efeitos colaterais:**
  - nenhum write em banco; apenas leituras agregadas.

## `app/page.tsx`

### `kpiValue(value, format)`
- **Objetivo:** formatar valor de KPI por tipo (`count/currency/percent`) para renderização consistente.
- **Entrada:** `value:number`, `format:'count'|'currency'|'percent'`.
- **Saída:** `string` formatada.
- **Erros:** não lança; fallback para número arredondado.
- **Efeitos colaterais:** nenhum.

### `toneClass(tone)`
- **Objetivo:** mapear estado semântico para classe visual (`state-critical`, etc.).
- **Entrada:** `tone:'critical'|'warning'|'healthy'|'info'`.
- **Saída:** nome de classe CSS (`string`).
- **Erros:** não lança; fallback implícito para `state-info`.
- **Efeitos colaterais:** nenhum.

---

## Endpoints/API criadas ou alteradas

## Endpoint alterado: `GET /api/dashboard`

### Contrato de entrada
- **Headers/cookies:** sessão autenticada obrigatória (`requireCurrentUserId`).
- **Body:** não aplicável.
- **Query:** não aplicável.

### Contrato de saída
- **200**
  ```json
  {
    "counts": { "overdueInvoices": 3, "openMaintenance": 4 },
    "finances": { "monthlyNetProfit": 7000, "collectionRate": 80 },
    "attention": {
      "daySummary": { "title": "Hoje há 2 prioridades críticas..." },
      "quickActions": [{ "id": "quick-charge-overdue", "tone": "critical" }],
      "attentionByPriority": { "high": [], "medium": [], "low": [] },
      "kpis": [{ "id": "kpi-overdue", "status": "critical", "value": 3 }]
    },
    "recentPayments": [],
    "recentInvoices": []
  }
  ```
- **401** retorno padrão de auth helper.
- **500** `{ "error": "Failed to load dashboard" }`.

### Regras de autenticação/autorização
- Apenas owner autenticado acessa dados do próprio tenant (filtros por `ownerId`).

### Casos de erro e mensagens
- `Failed to load dashboard` em erro inesperado de agregação.
- Erro de sessão da camada auth quando não autenticado.

---

## Features entregues

## 1) Resumo humano do dia
- Card “Resumo humano do dia” com título contextual, detalhe e highlights de risco.

## 2) Bloco de ações rápidas
- 5 CTAs operacionais com tom visual (critical/warning/healthy/info):
  - cobrar inadimplência,
  - confirmar pagamentos,
  - triar manutenção,
  - renovar contratos,
  - reduzir vacância.

## 3) Bloco atenção por prioridade
- Colunas Alta/Média/Baixa com itens clicáveis, descrição e CTA por item.

## 4) 6–8 KPIs acionáveis
- Implementados 8 KPIs com link direto e “ação recomendada”.

## 5) Cores e estados consistentes
- Novo sistema visual semântico:
  - `state-critical`
  - `state-warning`
  - `state-healthy`
  - `state-info`

---

## Como testar manualmente (passo a passo)
1. Subir app (`npm run dev`) e autenticar em `/login`.
2. Abrir dashboard (`/`).
3. Validar presença dos blocos:
   - Resumo humano,
   - Ações rápidas (5),
   - Atenção por prioridade,
   - 8 KPIs acionáveis.
4. Com dados de atraso/manutenção urgente, confirmar estado visual crítico.
5. Com ambiente sem pendências, confirmar fallback em prioridade baixa (“Sem pendências críticas...”).
6. Clicar em cada CTA/KPI e validar navegação para âncoras (`#financeiro`, `#operacao`, `#contratos`, `#cadastros`).

## Testes automatizados executados
- `node --test tests/dashboard-attention-model.test.js`
- `node --test tests/rent-state-machine.test.js tests/payment-confirmation-rules.test.js`

## Evidência de sucesso
- Suíte de testes do modelo de atenção passa validando:
  - quantidade de ações/KPIs,
  - priorização,
  - fallback,
  - estados críticos financeiros.
- Dashboard renderiza novos blocos com fallback explícito para ausência de dados.

---

## Documentação técnica relacionada atualizada
- `docs/KPI_ACTION_MAPPING.md`
- `docs/SPRINT7_ACTIONABLE_DASHBOARD.md`
- `README.md` (índice de documentação)
- `CHANGELOG.md`
- `TEMPORAL_CHECKLIST.md`
