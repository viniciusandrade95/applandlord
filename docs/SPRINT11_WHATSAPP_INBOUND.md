# Sprint 11 — WhatsApp inbound (inquilino)

## Objetivo
Processar respostas do inquilino com segurança, rastreabilidade e proteção contra duplicação.

## Mudanças implementadas
1. Parser de intenção (`tenant_claimed_paid`, `tenant_problem_reported`, `tenant_promised_tomorrow`, `unknown`).
2. Aplicação do estado de cobrança `AwaitingConfirmation` para mensagens de pagamento/pagamento amanhã.
3. Criação automática de ticket com palavras-chave de problema.
4. Resolução número -> inquilino -> contrato ativo -> cobrança ativa.
5. Proteções de anti-duplicação (idempotência por `dedupeKey`) e throttling por janela de 1 minuto.

---

## Documento de regras de interpretação de mensagens

### Regras de intenção
- `tenant_claimed_paid` quando texto contém sinais de pagamento: `ja paguei`, `paguei`, `ja transferi`, `comprovativo`.
- `tenant_promised_tomorrow` quando texto contém `pago amanha` ou `amanha pago`.
- `tenant_problem_reported` quando texto contém palavras de problema: `problema`, `avaria`, `vazamento`, `fuga`, `infiltracao`, `cano`, `eletric`, `luz`, `agua`, `fechadura`.
- `unknown` para mensagens fora das regras acima.

### Prioridade e ações por intenção
- `tenant_claimed_paid` e `tenant_promised_tomorrow`:
  - Se houver cobrança ativa, atualizar `Invoice.status = AwaitingConfirmation`.
  - Responder no WhatsApp confirmando registro e revisão do senhorio.
- `tenant_problem_reported`:
  - Criar `MaintenanceTicket` com prioridade `High`.
  - Criar `TicketEvent` do tipo `InboundWhatsAppProblem`.
  - Responder no WhatsApp informando abertura de ticket.
- `unknown`:
  - Somente registrar inbound e responder mensagem padrão.

### Resolução de vínculo (telefone -> domínio)
1. Normalizar telefone para dígitos.
2. Buscar `Renter.phone` contendo esse número.
3. Priorizar match exato de telefone normalizado.
4. Selecionar `Lease` com `status = Active`, ordenado por `startDate desc`.
5. Selecionar primeira cobrança ativa (`Pending`, `Overdue`, `Partial`, `AwaitingConfirmation`) por vencimento.

### Anti-duplicação e throttling
- **Idempotência**: chave `dedupeKey` gerada por:
  - `provider:<message.id>` quando `providerMessageId` existe.
  - fallback `hash:<sha256(phone::body_normalized)>`.
- **Persistência de dedupe**: constraint única em `WhatsAppInboundEvent(ownerId, dedupeKey)`.
- **Throttling**: bloquear quando já existem 5+ mensagens inbound do mesmo telefone/owner na janela de 60 segundos.

---

## Endpoint alterado: `POST /api/whatsapp/webhook`

### Contrato de entrada
- Headers:
  - `x-hub-signature-256` (ou `x-hub-signature`) obrigatório para validação HMAC.
- Body (Meta webhook):
  - `entry[].changes[].value.messages[].id` (opcional, usado para idempotência).
  - `entry[].changes[].value.messages[].from`.
  - `entry[].changes[].value.messages[].text.body`.

### Contrato de saída
- `200 { success: true, flow: 'admin-menu' }` quando origem é número admin.
- `200 { success: true, flow: 'tenant-inbound', handled, duplicate, throttled }` no fluxo de inquilino.
- `200 { success: true, ignored: true }` quando payload não possui mensagem válida.
- `401 { success: false, error: 'Invalid webhook signature' }` para assinatura inválida.
- `500 { success: false, error }` para erro interno.

### Autenticação/autorização
- Autenticação do webhook via assinatura HMAC.
- Autorização por número:
  - Lista `WHATSAPP_ADMIN_NUMBERS`: usa fluxo menu administrativo.
  - Demais números: fluxo inbound de inquilino baseado em vínculo de contrato ativo.

### Casos de erro e mensagens
- Sem contrato ativo para telefone: resposta amigável pedindo atualização de cadastro.
- Mensagem duplicada: resposta informando que já foi recebida.
- Rajada (throttle): resposta pedindo aguardar 1 minuto.

---

## Mudanças de dados

### Schema afetado
- Nova tabela `WhatsAppInboundEvent` com vínculos opcionais a `Renter`, `Lease`, `Invoice` e owner obrigatório.
- Índices e chave única por `(ownerId, dedupeKey)`.

### Migração aplicada
- `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/migration.sql`.

### Impacto em dados existentes
- Sem alteração destrutiva em tabelas existentes.
- Apenas adição de nova tabela e índices.
- Dados históricos permanecem intactos.

### Plano de rollback
1. Executar rollback da sprint: `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/rollback.sql`.
2. Reverter código do fluxo inbound (`app/api/whatsapp/webhook/route.ts` e `lib/tenant-inbound.ts`).
3. Reprocessar mensagens apenas se necessário, pois eventos inbound da tabela removida serão perdidos após rollback.

---

## Funções criadas/alteradas (resumo)

### `lib/tenant-inbound.ts`
- `normalizeInboundPhone`
- `parseTenantIntent`
- `computeInboundDedupeKey`
- `resolveTenantContextByPhone`
- `shouldThrottleTenantInbound`
- `processTenantInboundMessage`

> Todas as funções acima têm documentação inline com objetivo, entradas (tipos/validações), saída, erros e efeitos colaterais.

### `app/api/whatsapp/webhook/route.ts`
- `validateSignature` (documentação expandida)
- `extractMessagePayload` (inclui `providerMessageId`)
- `POST` (fluxo admin + fluxo tenant inbound)

---

## Como testar manualmente (passo a passo)
1. Configurar `WHATSAPP_WEBHOOK_SECRET` e (opcional) `WHATSAPP_ADMIN_NUMBERS`.
2. Enviar webhook assinado com telefone de inquilino e mensagem "já paguei".
3. Validar:
   - resposta do endpoint `flow: tenant-inbound`.
   - criação de `WhatsAppInboundEvent`.
   - criação de `WhatsAppMessage` inbound.
   - `Invoice.status = AwaitingConfirmation` (se cobrança ativa existir).
4. Enviar mensagem com "problema/vazamento".
5. Validar criação de `MaintenanceTicket` + `TicketEvent`.
6. Reenviar mesmo `providerMessageId`.
7. Validar retorno com `duplicate: true` e ausência de novos efeitos no banco.
8. Enviar >5 mensagens em <1 minuto.
9. Validar `throttled: true`.

---

## Testes automatizados executados
- `node --test tests/tenant-inbound-idempotency.test.js`
  - parser de intenção;
  - dedupe key com provider id e hash fallback;
  - idempotência de efeitos colaterais;
  - concorrência (20 chamadas em paralelo).

## Evidência de sucesso
- Testes automatizados da sprint passam.
- Fluxo inbound responde com `flow: tenant-inbound` e flags (`handled`, `duplicate`, `throttled`).
- Eventos ficam persistidos em tabela dedicada para rastreabilidade.
