# Sprint 14 — Demo final + go-live controlado

**Data:** 2026-04-18  
**Objetivo:** preparar demo comercial e operação inicial controlada.

## Entregáveis da sprint

1. **Pacote de demo completo**
   - `docs/demo/DEMO_SCRIPT_10_MIN.md`
   - `docs/demo/DEMO_IMPACT_DATA.json`
   - `docs/demo/DEMO_PRESENTATION_MATERIALS.md`
2. **Documento operacional pós-demo**
   - `docs/SPRINT14_POST_DEMO_OPERATION.md`
3. **Check final de riscos**
   - `docs/SPRINT14_RISK_CHECK_FINAL.md`
4. **Validação de estabilidade demo mode**
   - `tests/demo-mode-stability.test.js`

---

## 1) Script de demo de 10 minutos

- Roteiro temporal completo com objetivo por bloco, entrada, saída e mensagem de negócio.
- Inclui checklist pré-demo para garantir repetibilidade.

**Como testar**
1. Rodar `npm run db:seed:demo`.
2. Seguir `docs/demo/DEMO_SCRIPT_10_MIN.md` minuto a minuto.
3. Validar que cada bloco produz a saída esperada.

---

## 2) Dados fictícios de impacto

Arquivo: `docs/demo/DEMO_IMPACT_DATA.json`

### Estrutura principal
- `storyKpis`: dados agregados para narrativa comercial.
- `dashboardInput`: payload canônico para modelo de atenção diária.
- `contractWizardInput`: cenário válido de criação de contrato.
- `inboundScenario`: mensagem inbound para classificação de intenção e idempotência.
- `demoNarrative`: bullets para dor -> solução -> valor.

**Como testar**
- Executar `node --test tests/demo-mode-stability.test.js`.
- Confirmar que os testes carregam o JSON e validam os fluxos sem erro.

---

## 3) Validação do modo demo estável

### Função/fluxo: `buildDashboardAttentionModel`
- **Objetivo:** converter contagens e métricas em prioridades/ações/KPIs de operação.
- **Entrada:** `dashboardInput` (contagens e financeiros).
- **Saída:** objeto com `quickActions`, `attentionByPriority`, `kpis`.
- **Teste:** caso `demo dataset generates critical attention model expected for storytelling`.

### Função/fluxo: `parseLeaseWizardPayload` + `validateLeaseSchedule` + `validateLeaseRelations`
- **Objetivo:** validar cenário de criação de contrato usado na demo.
- **Entrada:** `contractWizardInput` e parâmetros de relação (`unitPropertyId`, `unitStatus`, `activeLeaseCountForUnit`).
- **Saída:** payload normalizado e validações sem exceção.
- **Teste:** caso `demo lease wizard scenario remains valid with expected input/output`.

### Função/fluxo: `assertRentChargeTransitionAllowed`
- **Objetivo:** garantir transições válidas da cobrança durante narrativa financeira.
- **Entrada:** `fromStatus`/`toStatus`.
- **Saída:** estados normalizados quando permitido; erro em regressão inválida.
- **Teste:** caso `demo rent transitions are valid and block regressions`.

### Função/fluxo: `parseTenantIntent` + `computeInboundDedupeKey` + `processWithIdempotency`
- **Objetivo:** classificar mensagem inbound de inquilino e bloquear duplicidade.
- **Entrada:** `messageBody`, `senderPhone`, `providerMessageId`, `ownerId`.
- **Saída:** intenção (`tenant_claimed_paid`) e resultado idempotente (`duplicate` true/false).
- **Teste:** caso `demo inbound flow is idempotent and classifies intent`.

---

## 4) Materiais de apresentação (dor -> solução -> valor)

Arquivo: `docs/demo/DEMO_PRESENTATION_MATERIALS.md`.

Conteúdo entregue:
- narrativa de dor operacional realista;
- mapeamento por pilares da solução;
- proposta de valor com números da base fictícia;
- mensagem de fecho para conversão comercial.

**Como testar**
- Ensaiar pitch completo de 10 min.
- Verificar consistência entre dados do JSON e argumentos de valor.

---

## 5) Plano pós-demo (30 dias)

Arquivo: `docs/SPRINT14_POST_DEMO_OPERATION.md`.

Inclui:
- execução em 3 fases (dias 1–7, 8–15, 16–30);
- critérios de sucesso semanais;
- KPIs mínimos de go-live controlado;
- governança de decisão Go/No-go ao fim do ciclo.

**Como testar**
- Revisar se todos os KPIs têm limiar objetivo.
- Simular reunião de status diária com runbook documentado.

---

## Evidência de execução técnica da sprint

### Comandos
- `npm run db:seed:demo`
- `node --test tests/demo-mode-stability.test.js`
- `node --test tests/e2e-critical-flows.test.js`

### Resultado esperado
- Seed concluída sem erro.
- Testes de estabilidade demo aprovados.
- Fluxos críticos E2E continuam verdes.
