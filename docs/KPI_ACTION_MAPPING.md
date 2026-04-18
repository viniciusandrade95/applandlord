# Sprint 7 — Mapeamento KPI -> Ação (Dashboard acionável)

Data: 2026-04-18

## Objetivo
Transformar cada KPI exibido no painel em um gatilho operacional explícito (o que fazer, onde clicar e qual resultado esperar).

## Mapa oficial

| KPI | Fonte de dados | Limiar/Estado | Ação recomendada | Link no painel | Resultado esperado |
|---|---|---|---|---|---|
| Cobranças em atraso | `counts.overdueInvoices` (`/api/dashboard`) | `> 0` = crítico | Priorizar contato e cobrança imediata | `#financeiro` | Redução de inadimplência e aging da carteira |
| Vencendo hoje | `attention.dueTodayInvoices` derivado no backend | `> 0` = atenção | Enviar lembretes preventivos no mesmo dia | `#financeiro` | Aumento de pagamento no prazo |
| Aguardando confirmação | `finances.awaitingConfirmation` | `> 0` = atenção | Revisar comprovativos e confirmar pagamentos | `#financeiro` | Caixa confirmado e status corretos das cobranças |
| Tickets urgentes | `attention.urgentMaintenance` | `> 0` = crítico | Despachar manutenção urgente | `#operacao` | Menor risco de escalonamento e churn |
| Tickets abertos | `counts.openMaintenance` | `> 5` = warning | Triar fila e priorizar por impacto | `#operacao` | Backlog operacional sob controle |
| Unidades vagas | `counts.vacantUnits` | `> 0` = warning | Atualizar oferta/comercial e acelerar ocupação | `#cadastros` | Redução da vacância |
| Lucro líquido mensal | `finances.monthlyNetProfit` | `< 0` = crítico | Revisar despesas e melhorar cobrança | `#financeiro` | Retorno à margem positiva |
| Taxa de cobrança | `finances.collectionRate` | `< 75` crítico, `75–89` warning | Reforçar régua de cobrança e confirmação | `#financeiro` | Elevação da taxa para faixa saudável |

## Regras de fallback de UI
- Se não houver dados de `attention.kpis`, frontend exibe bloco de fallback “Sem KPIs disponíveis (fallback de UI)”.
- Se KPI vier sem valor numérico, valor é exibido como `0` pelo formatador client-side.
- Mesmo sem itens críticos, o painel mantém CTA de prevenção (estado “healthy/info”).
