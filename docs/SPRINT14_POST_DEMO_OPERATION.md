# Sprint 14 — Plano operacional pós-demo (30 dias)

**Objetivo:** executar go-live controlado com risco reduzido e critérios claros de evolução.

## Fase 1 — Dias 1 a 7 (estabilização assistida)

- Ativar 1 conta piloto com escopo limitado (até 15 unidades).
- Rodar rotina diária de monitorização:
  - cobranças vencidas;
  - pagamentos aguardando confirmação;
  - tickets urgentes;
  - falhas de webhook/job.
- Cadência de suporte: check-in diário de 15 minutos.

### Critérios de sucesso da semana
- 0 incidentes críticos sem resposta em até 4h.
- 100% dos eventos críticos com trilha de auditoria.
- Fluxos-chave executados sem rollback manual de dados.

## Fase 2 — Dias 8 a 15 (otimização de operação)

- Refinar mensagens de cobrança conforme respostas reais do piloto.
- Ajustar limites de alertas e priorização no dashboard.
- Revisar tickets com maior recorrência para padrões de causa raiz.

### Critérios de sucesso da semana
- Redução de backlog de tickets urgentes.
- Aumento de taxa de confirmação de pagamento no primeiro contato.

## Fase 3 — Dias 16 a 30 (expansão controlada)

- Expandir para até 3 contas piloto adicionais.
- Consolidar playbook comercial com estudos de caso fictício+real.
- Realizar revisão executiva com decisão: expandir / manter / corrigir.

### KPIs mínimos de go-live controlado
- Taxa de cobrança >= 88%.
- Tempo médio de 1ª resposta em tickets <= 6h.
- Erro operacional crítico (P0) = 0.
- Taxa de duplicidade indevida em inbound = 0.

## Runbook de operação diária

1. Executar seed/apresentação apenas em ambiente demo.
2. Validar health-check dos fluxos com `tests/demo-mode-stability.test.js`.
3. Rever painel de atenção e abrir plano de ação do dia.
4. Registrar incidentes em log operacional (severidade, impacto, mitigação).
5. Publicar resumo diário (status + próximos passos + riscos).

## Governança de decisão (fim dos 30 dias)

- **Go:** metas de KPI atingidas e sem bloqueadores P0/P1.
- **No-go:** presença de falhas críticas recorrentes ou métricas abaixo do limiar mínimo por 2 semanas seguidas.
