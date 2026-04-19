# Sprint 14 — Check final de riscos (demo + operação controlada)

## Matriz de risco

| ID | Risco | Probabilidade | Impacto | Mitigação | Dono |
|---|---|---:|---:|---|---|
| R14-01 | Ambiente sem dados consistentes para demo | Média | Alta | Rodar `npm run db:seed:demo` antes de cada sessão | Operação |
| R14-02 | Regressão de fluxo crítico em demo | Baixa | Alta | Rodar `node --test tests/demo-mode-stability.test.js` | Engenharia |
| R14-03 | Falha de narrativa comercial (sem conexão dor->valor) | Média | Média | Usar roteiro fixo de 10 min e materiais padronizados | Comercial |
| R14-04 | Dependência de integração externa em ambiente restrito | Média | Média | Simular respostas e usar dados fictícios pré-carregados | Engenharia |
| R14-05 | Escopo excessivo no pós-demo de 30 dias | Média | Alta | Limitar pilotos e usar critérios de go/no-go | Produto |

## Checklist final

- [x] Script de demo de 10 minutos definido.
- [x] Dados fictícios de impacto documentados.
- [x] Validação de estabilidade de demo criada e testada.
- [x] Materiais de apresentação (dor -> solução -> valor) preparados.
- [x] Plano operacional de 30 dias documentado.
- [x] Critérios de go/no-go definidos.

## Critérios de bloqueio para apresentação

A demo **não deve** ser apresentada se ocorrer qualquer item abaixo:
1. Falha em testes de estabilidade do modo demo.
2. Base de dados de demo incompleta/inconsistente.
3. Fluxo de cobrança sem transição válida até `AwaitingConfirmation` ou `Paid`.
4. Ausência de narrativa de valor com KPI.
