# Demo comercial (10 minutos) — AppLandlord

**Objetivo:** demonstrar, em 10 minutos, a evolução de dor operacional para resultado mensurável com operação inicial controlada.

## Agenda de 10 minutos

| Tempo | Bloco | Objetivo | Entrada | Saída esperada |
|---|---|---|---|---|
| 00:00–01:00 | Contexto | Introduzir cenário e dores do senhorio | KPIs de baseline em `DEMO_IMPACT_DATA.json` | Público entende o problema inicial |
| 01:00–03:00 | Dashboard de atenção | Mostrar priorização diária | `/api/dashboard` e UI principal | Itens críticos + quick actions visíveis |
| 03:00–05:00 | Cobrança e confirmação | Mostrar fluxo de recuperação de renda | `/api/invoices`, `/api/payments`, `/api/invoices/:id/transition` | Cobrança avança para `AwaitingConfirmation`/`Paid` |
| 05:00–07:00 | WhatsApp outbound/inbound | Mostrar comunicação rastreável | `/api/jobs/reminders/daily`, `/api/whatsapp/webhook` | Reminder enviado + intenção classificada |
| 07:00–08:30 | Tickets operacionais | Mostrar resposta a urgências | `/api/tickets`, `/api/tickets/:id/events` | Ticket urgente com timeline e estado |
| 08:30–10:00 | Valor e próximos passos | Fechar com ROI e plano de 30 dias | materiais de apresentação + plano operacional | decisão de piloto controlado |

## Passo a passo do apresentador

1. **Preparação pré-demo (2-3 min antes):**
   - Executar `npm run db:seed:demo`.
   - Validar estabilidade: `node --test tests/demo-mode-stability.test.js`.
2. **Abrir dashboard** e narrar prioridades de cobrança + manutenção urgente.
3. **Abrir fluxo financeiro** e mostrar transição de cobrança (com regra de transição válida).
4. **Simular mensagem inbound do inquilino** (“já paguei”) e evidenciar idempotência.
5. **Mostrar ticket urgente** e timeline operacional.
6. **Fechar com métricas de impacto** e plano pós-demo.

## Checklist de execução rápida

- [ ] Seed aplicada sem erro.
- [ ] Dashboard com ao menos 1 cobrança vencida e 1 ticket urgente.
- [ ] Mensagem inbound classificada corretamente.
- [ ] Sem crash/erro de validação inesperado no fluxo crítico.
- [ ] Encerramento com próximos 30 dias e critérios de sucesso.
