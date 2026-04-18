# Sprint 10 — WhatsApp outbound real (cobranças e lembretes)

## 1) Objetivo da sprint
Automatizar cobranças por WhatsApp com suporte a:
- templates por contexto (vencimento normal, atraso, cobrança manual),
- job diário de reminders,
- retry básico em falhas de envio,
- persistência completa de mensagens/status,
- botão **Cobrar agora** integrado ao mesmo fluxo outbound.

---

## 2) Fluxo outbound implementado (operacional + logs)

### 2.1 Fluxo diário (job)
1. `POST /api/jobs/reminders/daily` valida segredo (`x-reminder-job-secret`).
2. `runDailyReminderJob(referenceDate)` procura cobranças (`Invoice`) não pagas e vencidas/até o dia.
3. Para cada cobrança sem reminder no dia, cria `Reminder` em `Pending`.
4. Busca reminders `Pending`/`RetryScheduled` elegíveis e despacha via `dispatchReminder`.
5. `dispatchReminder` cria log em `WhatsAppMessage` (`Queued`), envia para provider, e atualiza estado final (`Sent`/`Failed` + retry).
6. Job retorna sumário (`dueInvoices`, `remindersCreated`, `remindersProcessed`, `sent`, `failed`).

### 2.2 Fluxo manual (botão Cobrar agora)
1. UI chama `POST /api/whatsapp/send-invoice` com `tenantId` + `invoiceId`.
2. Endpoint valida sessão, ownership e payload.
3. `sendInvoiceWhatsApp` cria `Reminder` com `trigger=manual_collect_now` e template `rent_manual_collect_now`.
4. Envio é feito por `dispatchReminder` (mesma trilha de persistência e retry).
5. API retorna `success`, `detail`, `reminderId`, `providerMessageId`.

### 2.3 Logs operacionais
- `console.info('Dispatching WhatsApp reminder', { reminderId, invoiceId, attemptNumber, templateName })`
- `console.error('Failed to dispatch WhatsApp reminder', { reminderId, attemptNumber, status, error })`
- `console.info('Daily reminder job finished', { ...sumário })`
- `console.info('Sending invoice via WhatsApp', { invoiceId, renterId, reminderId, providerMessageId })`

---

## 3) Documentação de funções criadas/alteradas

## `lib/whatsapp-templates.ts`

### `formatTemplateCurrency(amount: number): string`
- **Objetivo:** formatar valor monetário para EUR (`pt-PT`).
- **Entrada:**
  - `amount` (`number`) — deve ser numérico finito.
  - Exemplo: `1250`.
- **Saída:**
  - `string` no formato de moeda. Exemplo: `"1 250,00 €"`.
- **Erros/comportamento:**
  - Não lança erro explícito; valores inválidos podem produzir formatação inesperada do `Intl`.
- **Efeitos colaterais:**
  - Nenhum.

### `formatTemplateDate(value: Date): string`
- **Objetivo:** padronizar data em `dd/mm/aaaa` para mensagens.
- **Entrada:**
  - `value` (`Date`) válida.
  - Exemplo: `new Date('2026-04-18T00:00:00.000Z')`.
- **Saída:**
  - `string` formatada. Exemplo: `"18/04/2026"`.
- **Erros/comportamento:**
  - Não valida `Invalid Date`; depende de uso correto pelo chamador.
- **Efeitos colaterais:**
  - Nenhum.

### `resolveReminderTemplateName(dueDate: Date, referenceDate = new Date()): WhatsAppTemplateName`
- **Objetivo:** escolher template entre lembrete normal e atraso com base na comparação de datas (dia calendário).
- **Entrada:**
  - `dueDate` (`Date`) da cobrança.
  - `referenceDate` (`Date`, opcional) base do job/manual.
  - Exemplo: `dueDate=2026-04-10`, `referenceDate=2026-04-18`.
- **Saída:**
  - `'rent_overdue_notice'` quando vencimento < referência.
  - `'rent_reminder_due'` caso contrário.
- **Erros/comportamento:**
  - Com datas inválidas, comparação pode degradar para fallback natural.
- **Efeitos colaterais:**
  - Nenhum.

### `renderWhatsAppTemplate(templateName, context): string`
- **Objetivo:** renderizar texto final por tipo de template.
- **Entrada:**
  - `templateName` (`WhatsAppTemplateName`) — valores permitidos:
    - `rent_reminder_due`
    - `rent_overdue_notice`
    - `rent_manual_collect_now`
    - `payment_confirmation`
  - `context` (`WhatsAppTemplateContext`) obrigatório:
    - `renterName` (`string`)
    - `invoiceId` (`string`)
    - `amount` (`number`)
    - `dueDate` (`Date`)
    - `propertyName` (`string`)
    - `unitName` (`string`)
- **Saída:**
  - `string` pronta para envio ao provider.
- **Erros/comportamento:**
  - Template desconhecido cai no fallback de lembrete normal.
- **Efeitos colaterais:**
  - Nenhum.

## `lib/whatsapp-reminders.ts`

### `createReminderForInvoice(input): Promise<Reminder>`
- **Objetivo:** criar reminder persistido para uma cobrança.
- **Entrada (`input`):**
  - `ownerId` (`string`) obrigatório.
  - `invoiceId` (`string`) obrigatório.
  - `scheduledFor` (`Date`, opcional).
  - `templateName` (`WhatsAppTemplateName`, opcional).
  - `trigger` (`'daily_job' | 'manual_collect_now'`) obrigatório.
- **Validações:**
  - Cobrança deve existir e pertencer ao `ownerId`.
- **Saída:**
  - Registro `Reminder` com `status='Pending'`, `channel='WHATSAPP'`, `payload.templateName`.
- **Erros:**
  - `Invoice not found`.
- **Efeitos colaterais:**
  - Escrita em DB (`Reminder`).

### `dispatchReminder(reminderId: string): Promise<{...}>`
- **Objetivo:** enviar reminder para WhatsApp com persistência e retry.
- **Entrada:**
  - `reminderId` (`string`) obrigatório.
- **Validações internas:**
  - Reminder existe.
  - Reminder vinculado à cobrança.
  - Inquilino com telefone válido.
- **Saída (sucesso):**
  - `{ success: true, reminderId, attemptNumber, providerMessageId }`.
- **Saída (falha):**
  - `{ success: false, reminderId, attemptNumber, error, status }`.
- **Erros/comportamento esperado:**
  - Em exceção de envio/validação, incrementa `attempts` e:
    - `RetryScheduled` se ainda houver tentativa.
    - `Failed` quando atingir limite (`MAX_REMINDER_ATTEMPTS=3`).
- **Efeitos colaterais:**
  - Cria/atualiza `WhatsAppMessage` (log de request/response/erro).
  - Atualiza `Reminder` (`status`, `attempts`, `failureReason`, `sentAt`, `externalRef`, `scheduledFor`).
  - Chamada externa ao Graph API (`sendTextMessage`).

### `runDailyReminderJob(referenceDate = new Date()): Promise<{...summary}>`
- **Objetivo:** executar ciclo diário completo (agendar + despachar reminders).
- **Entrada:**
  - `referenceDate` (`Date`, opcional).
- **Regras:**
  - Seleciona invoices `status != Paid` com `dueDate <= fim do dia`.
  - Evita duplicação diária (`invoiceId + ownerId + janela do dia`).
  - Processa lote de até 100 reminders elegíveis por execução.
- **Saída:**
  - Sumário operacional:
    - `referenceDate`, `dueInvoices`, `remindersCreated`, `remindersProcessed`, `sent`, `failed`.
- **Erros:**
  - Propaga erros de DB/chamada externa, tratados na API de job.
- **Efeitos colaterais:**
  - Escrita em `Reminder` + `WhatsAppMessage`, chamadas externas e logs.

## `lib/whatsapp-invoice.ts` (alterada)

### `sendInvoiceWhatsApp(invoiceId, ownerId, renterId?)`
- **Objetivo:** acionar cobrança manual imediata pela UI/API.
- **Entrada:**
  - `invoiceId` (`string`) obrigatório.
  - `ownerId` (`string`) obrigatório.
  - `renterId` (`string`, opcional) para validação de vínculo.
- **Saída:**
  - `{ invoice, reminderId, providerMessageId }`.
- **Erros:**
  - `Invoice not found`
  - `Invoice does not belong to the provided tenantId`
  - erros de telefone/envio propagados de `dispatchReminder`.
- **Efeitos colaterais:**
  - Criação de `Reminder`, criação/atualização de `WhatsAppMessage`, envio externo.

---

## 4) Endpoints/API criadas ou alteradas

### 4.1 `POST /api/jobs/reminders/daily` (novo)
- **Autenticação/autorização:**
  - Header obrigatório: `x-reminder-job-secret`.
  - Valor deve bater com `REMINDER_JOB_SECRET`.
- **Contrato de entrada:**
  - `headers`:
    - `x-reminder-job-secret: string`.
  - `body` (opcional):
    - `referenceDate?: string` (ISO date/time).
- **Contrato de saída:**
  - `200`:
    ```json
    {
      "success": true,
      "summary": {
        "referenceDate": "2026-04-18T00:00:00.000Z",
        "dueInvoices": 12,
        "remindersCreated": 8,
        "remindersProcessed": 9,
        "sent": 7,
        "failed": 2
      }
    }
    ```
  - `400`: `Invalid referenceDate`.
  - `401`: `Unauthorized reminder job call`.
  - `500`: erro interno (inclui `Missing REMINDER_JOB_SECRET`).
- **Casos de erro + mensagens:**
  - segredo inválido/ausente no request,
  - data inválida,
  - falha DB/provider.

### 4.2 `POST /api/whatsapp/send-invoice` (alterado)
- **Autenticação/autorização:**
  - Sessão obrigatória (`requireCurrentUserId`).
  - Escopo por `ownerId`.
- **Contrato de entrada:**
  - `body`:
    ```json
    {
      "tenantId": "string",
      "invoiceId": "string"
    }
    ```
- **Contrato de saída:**
  - `200`:
    ```json
    {
      "success": true,
      "detail": "Mensagem enviada.",
      "reminderId": "string",
      "providerMessageId": "string|null"
    }
    ```
  - `400`: validação payload/telefone.
  - `404`: cobrança não encontrada ou sem vínculo com tenant.
  - `500`: integração/falha interna.
- **Casos de erro + mensagens:**
  - `tenantId and invoiceId are required`
  - `Invoice not found`
  - `Invoice does not belong to the provided tenantId`
  - erros de telefone/envio do fluxo outbound.

---

## 5) Mudanças de dados

- **Schema afetado:** sem alteração estrutural nesta sprint (reuso de `Reminder` e `WhatsAppMessage`, criados na Sprint 3).
- **Migração aplicada:** nenhuma migration nova.
- **Impacto em dados existentes:**
  - aumento de volume em `Reminder` e `WhatsAppMessage` por execução diária/manual;
  - estados novos efetivos em uso operacional de reminder: `Pending`, `RetryScheduled`, `Sent`, `Failed`.
- **Plano de rollback:**
  1. Desativar agendamento do endpoint de job.
  2. Reverter código da sprint 10 (`lib/whatsapp-reminders.ts`, `lib/whatsapp-templates.ts`, rota de job e alterações no envio manual).
  3. Manter dados históricos (ou arquivar por janela temporal) sem necessidade de DDL.

---

## 6) Plano de teste (inclui simulação de falhas)

## 6.1 Teste manual — cobrança manual
1. Abrir painel e localizar fatura em aberto.
2. Clicar em **Cobrar agora**.
3. Confirmar toast de sucesso.
4. Verificar no DB:
   - novo `Reminder` com `trigger=manual_collect_now` no payload;
   - `WhatsAppMessage` com `direction=OUTBOUND`, `templateName=rent_manual_collect_now`.

## 6.2 Teste manual — job diário
1. Garantir invoices não pagas vencidas/até o dia.
2. Executar:
   ```bash
   curl -X POST http://localhost:3000/api/jobs/reminders/daily \
     -H "Content-Type: application/json" \
     -H "x-reminder-job-secret: <REMINDER_JOB_SECRET>" \
     -d '{"referenceDate":"2026-04-18T09:00:00.000Z"}'
   ```
3. Validar `summary` no retorno.
4. Confirmar persistência em `Reminder`/`WhatsAppMessage`.

## 6.3 Simulação de falhas (retry)
1. Remover temporariamente `WHATSAPP_TOKEN` **ou** usar token inválido.
2. Executar job/"Cobrar agora".
3. Validar:
   - `Reminder.attempts` incrementado;
   - `Reminder.status='RetryScheduled'` nas tentativas 1–2;
   - `Reminder.status='Failed'` na tentativa 3;
   - `WhatsAppMessage.status='Failed'` com `failureReason`.
4. Restaurar token e reprocessar para confirmar recuperação.

---

## 7) Testes automatizados executados
- `node --test tests/whatsapp-reminder-flow.test.js`
  - valida seleção de template por data;
  - valida política de retry (agendamento e falha final).

---

## 8) Evidência de sucesso
- Fluxo manual e job diário convergem para o mesmo dispatcher (`dispatchReminder`), garantindo rastreabilidade única.
- Logs operacionais adicionados para execução, erro e sumário de processamento.
- Persistência de request/response/erro em `WhatsAppMessage` e de ciclo de envio em `Reminder`.
