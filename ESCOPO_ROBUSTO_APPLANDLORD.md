# Escopo Robusto e Completo — AppLandlord v1.0

## 📋 Resumo Executivo

**AppLandlord** é um sistema SaaS completo de gestão imobiliária para senhorios, desenvolvido com Next.js, Prisma e PostgreSQL. O sistema foi construído em **14 sprints** (70 dias úteis) e está pronto para produção.

### Estado Atual do Projeto
- ✅ **MVP Funcional Completo** — todas as funcionalidades núcleo implementadas
- ✅ **WhatsApp Integrado** — envio e recebimento automatizados
- ✅ **Dashboard Acionável** — foco em "o que fazer hoje"
- ✅ **Segurança Hardened** — rate limiting, auditoria, backup testado
- ✅ **Pronto para Deploy** — configuração Render incluída

---

## 🏗️ Arquitetura Técnica

### Stack Tecnológico
```
Frontend:       Next.js 14+ (React Server Components + Client Components)
Backend:        Next.js API Routes
Banco de Dados: PostgreSQL (via Render ou local)
ORM:            Prisma
Autenticação:   Session-based com cookies seguros
WhatsApp:       Meta WhatsApp Business API (Cloud API)
Deploy:         Render (Blueprint com Web Service + PostgreSQL)
```

### Estrutura de Diretórios
```
/workspace
├── app/                      # Next.js App Router
│   ├── (workspace)/          # Área autenticada
│   │   ├── dashboard/        # Home do senhorio (Daylight UI)
│   │   ├── portfolio/        # Gestão de imóveis
│   │   ├── leases/           # Contratos de arrendamento
│   │   ├── billing/          # Faturas e pagamentos
│   │   └── operations/       # Tickets de manutenção
│   ├── api/                  # Rotas API REST
│   ├── components/           # Componentes React reutilizáveis
│   └── login/                # Autenticação
├── lib/                      # Lógica de negócio (TypeScript)
│   ├── apartments.ts         # VM de apartamentos
│   ├── finance.ts            # Validações financeiras
│   ├── rent-state-machine.ts # Máquina de estados de cobrança
│   ├── whatsapp-*.ts         # Fluxos WhatsApp (inbound/outbound)
│   ├── dashboard-attention.ts# Modelo de atenção diária
│   └── audit.ts              # Logs de auditoria
├── prisma/
│   ├── schema.prisma         # Modelo de dados completo
│   └── migrations/           # Histórico de migrações
├── docs/                     # Documentação por sprint
├── tests/                    # Testes automatizados
└── render.yaml               # Configuração de deploy
```

---

## 📊 Modelo de Dados (Schema Prisma)

### Entidades Principais

#### 1. **User (Perfil do Senhorio)**
- `id`, `email`, `passwordHash`, `name`
- Relacionamentos: properties, units, renters, leases, invoices, payments, expenses, tickets
- Isolamento total por `owner_id` (multi-tenant)

#### 2. **Property (Imóvel)**
- `id`, `ownerId`, `name`, `addressLine1`, `city`, `region`, `postalCode`
- Relacionamentos: units[], leases[], maintenance[], expenses[]
- Índice: `[ownerId]`

#### 3. **Unit (Unidade/Apartamento)**
- `id`, `ownerId`, `propertyId`, `name`, `bedrooms`, `bathrooms`, `areaSqm`
- `monthlyRent`, `status` (Vacant/Occupied/Maintenance)
- Relacionamentos: leases[], maintenance[], expenses[]
- Índices: `[ownerId]`, `[propertyId]`

#### 4. **Renter (Inquilino)**
- `id`, `ownerId`, `fullName`, `email`, `phone`, `governmentId`, `notes`
- Relacionamentos: leases[], maintenance[], whatsappMsgs[], inboundEvents[]
- Índice: `[ownerId]`

#### 5. **Lease (Contrato de Arrendamento)**
- `id`, `ownerId`, `propertyId`, `unitId`, `renterId`
- `startDate`, `endDate`, `monthlyRent`, `depositAmount`, `dueDay`
- `status` (Draft/Active/Ended/Terminated/Renewed)
- Relacionamentos: invoices[], reminders[], expenses[], maintenance[], inboundEvents[]
- **Constraint única**: 1 contrato ativo por unidade
- Índices: `[ownerId]`, `[ownerId, status, startDate]`, `[ownerId, unitId, status]`

#### 6. **Invoice (Fatura/Cobrança Mensal)**
- `id`, `ownerId`, `leaseId`, `period` (ex: "2026-04")
- `dueDate`, `amount`, `status`
- Estados: `Pending → DueSoon → Late → ReminderSent → TenantClaimedPaid → AwaitingConfirmation → Paid`
- Estados complementares: `Partial`, `Disputed`, `Cancelled`
- Relacionamentos: payments[], expenses[], reminders[], whatsappMsgs[], inboundEvents[], transitionLogs[]
- **Unique**: `[leaseId, period]` (evita duplicação mensal)
- Índices: `[ownerId]`, `[dueDate]`, `[status]`, `[ownerId, status, dueDate]`

#### 7. **Payment (Pagamento)**
- `id`, `ownerId`, `invoiceId`, `amount`, `paidAt`, `method`
- `receiptUrl` (comprovativo), `reference`, `notes`
- `confirmationStatus` (AwaitingConfirmation/Confirmed)
- `confirmedAt`, `confirmedByUserId`
- Relacionamentos: invoice
- Índices: `[ownerId]`, `[invoiceId]`, `[ownerId, paidAt]`, `[ownerId, confirmationStatus]`

#### 8. **Expense (Despesa por Imóvel/Contrato)**
- `id`, `ownerId`, `propertyId?`, `unitId?`, `leaseId?`, `invoiceId?`
- `category` (Água/Luz/Net/Condomínio/IPTU/Manutenção/Outros)
- `description`, `amount`, `incurredAt`
- Relacionamentos: property?, unit?, lease?, invoice?
- Índices: `[ownerId]`, `[ownerId, incurredAt]`

#### 9. **MaintenanceTicket (Ticket de Manutenção)**
- `id`, `ownerId`, `propertyId?`, `unitId?`, `leaseId?`, `renterId?`
- `title`, `description`, `priority` (Normal/Urgente/Emergência)
- `status` (New/Triaged/WaitingLandlord/WaitingTenant/Scheduled/Resolved/Closed)
- `requestedAt`, `triagedAt`, `waitingAt`, `resolvedAt`, `closedAt`
- Relacionamentos: events[]
- Índices: `[ownerId, status, priority, updatedAt]`

#### 10. **TicketEvent (Evento do Ticket)**
- `id`, `ownerId`, `ticketId`, `type`, `fromStatus`, `toStatus`, `note`, `payload`, `createdById`
- Auditoria completa de transições

#### 11. **Reminder (Lembrete WhatsApp)**
- `id`, `ownerId`, `leaseId?`, `invoiceId?`
- `channel` (WHATSAPP), `status` (Pending/RetryScheduled/Sent/Failed)
- `scheduledFor`, `sentAt`, `attempts`, `externalRef`, `failureReason`
- `payload` (JSON com templateName, contexto)
- Relacionamentos: whatsappMsgs[]
- Índices: `[ownerId, status, scheduledFor]`

#### 12. **WhatsAppMessage (Log de Mensagens)**
- `id`, `ownerId`, `renterId?`, `invoiceId?`, `reminderId?`
- `direction` (INBOUND/OUTBOUND), `messageType` (text/template)
- `templateName`, `providerMsgId`, `toPhone`, `fromPhone`, `body`
- `status` (Queued/Sent/Delivered/Read/Failed)
- `failureReason`, `providerPayload` (JSON)
- `sentAt`, `deliveredAt`, `readAt`
- Índices: `[ownerId, status, createdAt]`, `[providerMsgId]`

#### 13. **WhatsAppInboundEvent (Eventos Recebidos)**
- `id`, `ownerId`, `renterId?`, `leaseId?`, `invoiceId?`
- `senderPhone`, `messageBody`, `intent` (PAYMENT_CLAIM/TICKET_REPORT/MENU/etc.)
- `dedupeKey` (idempotência), `providerMessageId`
- **Unique**: `[ownerId, dedupeKey]`
- Índices: `[ownerId, senderPhone, createdAt]`, `[ownerId, intent, createdAt]`

#### 14. **AuditLog (Auditoria Geral)**
- `id`, `ownerId`, `actorId`, `entityType`, `entityId`, `action`, `severity`
- `metadata` (JSON), `ipAddress`, `userAgent`
- Índices: `[ownerId, createdAt]`, `[entityType, entityId]`, `[action, createdAt]`

#### 15. **RentChargeTransitionLog (Auditoria de Estados de Cobrança)**
- `id`, `ownerId`, `invoiceId`, `previousStatus`, `newStatus`, `note`, `triggeredByUserId`
- Rastreabilidade completa de mudanças de estado

---

## 🎯 Funcionalidades Implementadas

### 1. **Autenticação e Isolamento Multi-Tenant** (Sprint 2)
- ✅ Login seguro com sessão baseada em cookies
- ✅ Isolamento total de dados por `owner_id`
- ✅ Middleware de autenticação em todas as rotas protegidas
- ✅ `AUTH_SECRET` obrigatória no `.env`

**O que o usuário vê:**
- Tela de login simples (email/senha)
- Logout seguro
- Dados completamente isolados (não vê dados de outros senhorios)

---

### 2. **Gestão de Imóveis e Unidades** (Sprint 1-3)
- ✅ CRUD completo de propriedades
- ✅ Cadastro de unidades/apartamentos por propriedade
- ✅ Status de ocupação (Vago/Ocupado/Em Manutenção)
- ✅ Lista paginada com busca server-side
- ✅ Filtros por status

**O que o usuário vê:**
- Lista de todos os imóveis com endereços
- Botão "+ Adicionar imóvel"
- Edição de detalhes (quartos, banheiros, área, renda mensal)
- Visualização rápida de ocupação

---

### 3. **Wizard de Criação de Contrato** (Sprint 4)
- ✅ Fluxo guiado passo-a-passo para criar contrato
- ✅ Criação de inquilino durante o fluxo
- ✅ Validações de domínio (1 contrato ativo por unidade)
- ✅ Definição de dia de vencimento, valor, depósito
- ✅ Estados do contrato: Draft → Active → Ended/Terminated → Renewed

**O que o usuário vê:**
- Assistente com etapas claras
- Campos: dados do inquilino, imóvel, valores, datas
- Validação em tempo real
- Confirmação antes de criar

---

### 4. **Geração Automática de Faturas Mensais** (Sprint 5)
- ✅ Job automático gera faturas no início de cada mês
- ✅ Baseado nos contratos ativos
- ✅ Evita duplicação (unique constraint)
- ✅ Máquina de estados de cobrança formalizada

**Estados da Cobrança:**
```
Pending → DueSoon (7 dias antes) → Late (após vencimento)
       → ReminderSent (lembrete enviado)
       → TenantClaimedPaid (inquilino diz "já paguei")
       → AwaitingConfirmation (aguarda confirmação manual)
       → Paid (confirmado pelo senhorio)
       
Estados alternativos: Partial, Disputed, Cancelled
```

**O que o usuário vê:**
- Faturas geradas automaticamente todo mês
- Notificação de novas faturas
- Lista de cobranças por vencer/vencidas/pagas

---

### 5. **Núcleo Financeiro: Pagamentos e Despesas** (Sprint 6)

#### 5.1 Pagamentos com Confirmação Manual
- ✅ Registo de pagamento com comprovativo opcional (URL)
- ✅ Estado intermediário `AwaitingConfirmation`
- ✅ Confirmação manual pelo senhorio (botão "Confirmar")
- ✅ Cálculo automático de status (Paid vs Partial)
- ✅ Auditoria completa (quem confirmou, quando)

**Fluxo ponta-a-ponta:**
1. Inquilino paga e envia comprovativo
2. Sistema regista pagamento como `AwaitingConfirmation`
3. Senhorio recebe notificação e revisa comprovativo
4. Senhorio clica "Confirmar"
5. Sistema atualiza fatura para `Paid` ou `Partial`
6. Dashboard reflete receita confirmada

#### 5.2 Lançamento em Lote de Despesas (Batch Expenses)
- ✅ **Funcionalidade CHAVE para simplificar seu trabalho**
- ✅ Seleciona tipo de conta (Água, Luz, Net, Condomínio, IPTU)
- ✅ Exibe TODOS os imóveis numa lista corrida
- ✅ Digita valores linha por linha (só o necessário)
- ✅ Botão "Preencher com último valor" (memória do sistema)
- ✅ Total calculado em tempo real
- ✅ Guardar = 1 operação em lote (não 25 individuais)
- ✅ Idempotência (duplo clique não duplica)

**O que o usuário vê:**
1. Clica em "Lançar Contas" no menu Finanças
2. Escolhe ícone: 💡 Luz, 💧 Água, 🌐 Net, 🏢 Condomínio, 📄 IPTU
3. Vê lista: "Apartamento 101 — R$ [____]", "Apartamento 102 — R$ [____]"
4. Digita valores (ou clica "usar R$ 150" se já tiver histórico)
5. Rodapé mostra: "25 contas · R$ 3.750"
6. Clica "Guardar 25" → Pronto!

**Vantagem vs Excel:**
- Excel: 125 células preenchidas manualmente + risco de erro
- App: 1 tela, digitação rápida, validação automática, 1 clique

---

### 6. **Dashboard Acionável "Daylight"** (Sprint 7)

#### Filosofia de Design
- **"Gestão por exceção"**: mostra apenas o que precisa de ação
- **"Pulso do mês"**: contagem clara (pagos, por pagar, vazios)
- **"Para resolver"**: top 5 tarefas prioritárias
- **Lista completa**: todos os imóveis com busca e filtros

#### Estrutura do Dashboard
```
┌─────────────────────────────────────────────┐
│  Meus apartamentos                          │
│  25 unidades                                │
├─────────────────────────────────────────────┤
│  SITUAÇÃO DO MÊS                            │
│  ████████░░░░░░░░░░░░░░░                    │
│  12 pagos · 8 por pagar · 5 vazios          │
├─────────────────────────────────────────────┤
│  PARA RESOLVER · 8                          │
│  ┌─────────────────────────────────────┐    │
│  │ 🔴 Apt 101 — João · R$ 1.200        │    │
│  │ [Recebi]                            │    │
│  ├─────────────────────────────────────┤    │
│  │ 🟡 Apt 205 — Maria · R$ 950         │    │
│  │ [Confirmar]                         │    │
│  └─────────────────────────────────────┘    │
├─────────────────────────────────────────────┤
│  TODOS OS IMÓVEIS                           │
│  🔍 Buscar apartamento ou inquilino...      │
│                                             │
│  [Todos 25] [Devendo 8] [Conferir 3]        │
│  [Pagos 12] [Vazios 5]                      │
│                                             │
│  ● Apt 101 — João Silva        R$ 1.200     │
│    [Devendo]                                  │
│  ● Apt 102 — Maria Santos      R$ 950       │
│    [Pago]                                     │
│  ...                                        │
│                                             │
│  [Ver mais (15 de 25)]                      │
└─────────────────────────────────────────────┘
```

#### KPIs Implementados (8 métricas acionáveis)
1. **Renda Esperada (mês)** — total de faturas emitidas
2. **Renda Recebida** — pagamentos confirmados
3. **Renda em Atraso** — faturas vencidas não pagas
4. **Rendas a Vencer (7 dias)** — lembrete antecipado
5. **Despesas do Mês** — total lançado
6. **Lucro Líquido Estimado** — receita - despesas
7. **Tickets Abertos** — manutenções pendentes
8. **Contratos a Expirar** — renovações próximas

**O que o usuário vê:**
- Resumo visual imediato (5 segundos para entender)
- Cores semânticas: 🟢 Pago, 🟡 Conferir, 🔴 Devendo, ⚫ Vazio
- Ações rápidas: "Cobrar inadimplência", "Confirmar pagamentos"
- Lista densa com busca e filtros

---

### 7. **UX e Microcopy** (Sprint 8)
- ✅ Linguagem do senhorio (sem jargão técnico)
- ✅ 1 ação principal por ecrã
- ✅ Empty states acionáveis ("Adicione seu primeiro apartamento")
- ✅ Mensagens de erro claras e humanas
- ✅ Guia de microcopy documentado

**Exemplos de Microcopy:**
- ❌ "Erro 404: Recurso não encontrado"
- ✅ "Este apartamento não existe ou foi removido."
- ❌ "Transição de estado inválida"
- ✅ "Não é possível confirmar este pagamento porque ainda não foi registado."

---

### 8. **Módulo de Tickets de Manutenção** (Sprint 9)
- ✅ CRUD de tickets (Novo/Triado/Em Espera/Resolvido/Fechado)
- ✅ Vinculação a imóvel/unidade/inquilino
- ✅ Prioridades (Normal/Urgente/Emergência)
- ✅ Eventos de auditoria (quem mudou o quê e quando)
- ✅ Máquina de estados formalizada

**Fluxo do Ticket:**
```
New → Triaged → WaitingLandlord → Scheduled → Resolved → Closed
                  ↓
           WaitingTenant
```

**O que o usuário vê:**
- Lista de tickets abertos
- Botão "Novo Ticket"
- Detalhes: descrição, prioridade, inquilino afetado
- Timeline de eventos ("João marcou como resolvido há 2h")

---

### 9. **WhatsApp Outbound (Cobranças e Lembretes)** (Sprint 10)

#### Funcionalidades
- ✅ Templates por contexto:
  - `rent_reminder_due` (antes do vencimento)
  - `rent_overdue_notice` (após vencimento)
  - `rent_manual_collect_now` (cobrança manual)
  - `payment_confirmation` (confirmação de pagamento)
- ✅ Job diário automático (`POST /api/jobs/reminders/daily`)
- ✅ Retry com backoff (3 tentativas máximas)
- ✅ Persistência completa (mensagem, status, provider payload)
- ✅ Botão "Cobrar agora" na UI

#### Job Diário (Automático)
1. Executa todo dia (configurar cron no Render ou externo)
2. Busca faturas não pagas vencidas/até o dia
3. Cria lembretes em `Pending` (evita duplicação diária)
4. Envia via WhatsApp (retry em falhas)
5. Log completo em `WhatsAppMessage`

**Payload do Job:**
```json
POST /api/jobs/reminders/daily
Headers: x-reminder-job-secret: <segredo>
Body: { "referenceDate": "2026-04-18T09:00:00.000Z" }

Resposta:
{
  "success": true,
  "summary": {
    "referenceDate": "2026-04-18T09:00:00.000Z",
    "dueInvoices": 12,
    "remindersCreated": 8,
    "remindersProcessed": 9,
    "sent": 7,
    "failed": 2
  }
}
```

#### Cobrança Manual ("Cobrar agora")
1. Usuário clica botão na fatura
2. Sistema cria reminder com `trigger=manual_collect_now`
3. Envia imediatamente
4. Retorna `reminderId` e `providerMessageId`

**O que o usuário vê:**
- Botão "Enviar WhatsApp" em cada fatura
- Toast de confirmação: "Mensagem enviada para +55 11 99999-9999"
- Histórico de mensagens enviadas (auditoria)

---

### 10. **WhatsApp Inbound (Recebimento de Inquilinos)** (Sprint 11)

#### Parser de Intenção
- ✅ Detecção automática de intenção:
  - `PAYMENT_CLAIM` ("já paguei", "comprovante enviado")
  - `TICKET_REPORT` ("tem um vazamento", "preciso de reparo")
  - `MENU` ("menu", "ajuda", "opções")
  - `INVOICE_REQUEST` ("quero minha fatura", "2ª via")
  - `UNKNOWN` (fallback)
- ✅ Deduplicação por `dedupeKey` (evita processar mesma mensagem 2x)
- ✅ Throttling (limite de mensagens por minuto)
- ✅ Vínculo telefone → contrato (busca por phone no Renter)

#### Fluxo de Menu (Inquilino)
```
Inquilino: "menu"
Bot:       "Olá, João! Escolha uma opção:
            1. Ver faturas em aberto
            2. Enviar comprovativo de pagamento
            3. Reportar problema/manutenção
            4. Falar com proprietário"
```

#### Fluxo de Pagamento Claim
```
Inquilino: "já paguei a renda"
Bot:       "Por favor, envie o comprovativo (foto ou PDF)"
Inquilino: [envia imagem]
Bot:       "Recebido! Seu pagamento está em análise.
            Avisaremos quando confirmado."
Sistema:   → Cria Payment em AwaitingConfirmation
           → Notifica senhorio no dashboard
```

#### Fluxo de Ticket
```
Inquilino: "tem um vazamento na cozinha"
Bot:       "Entendi. Vou abrir um ticket de manutenção.
            Pode enviar uma foto?"
Inquilino: [envia foto]
Bot:       "Ticket #123 criado! Prioridade: Normal.
            Retornaremos em até 24h."
Sistema:   → Cria MaintenanceTicket (status=New)
           → Vincula ao inquilino e unidade
           → Notifica senhorio
```

**O que o usuário vê:**
- Mensagens recebidas aparecem no dashboard
- Tickets criados automaticamente
- Pagamentos claimados aparecem em "Para Confirmar"
- Histórico completo de conversas

---

### 11. **Hardening e Segurança** (Sprint 12)

#### Validações Reforçadas
- ✅ Rate limiting por IP e por usuário
- ✅ Validação de schema em todos os inputs
- ✅ Sanitização de dados sensíveis
- ✅ Proteção contra SQL injection (Prisma ORM)
- ✅ CSRF protection em formulários

#### Observabilidade
- ✅ Logs estruturados (console.info/error com contexto)
- ✅ Auditoria de ações críticas (AuditLog)
- ✅ Health checks para monitoramento
- ✅ Métricas de performance (tempo de resposta)

#### Backup e Recovery
- ✅ Script de backup automático (pg_dump)
- ✅ Drill de restore testado e documentado
- ✅ Checksum de integridade (SHA-256)
- ✅ Evidência de teste em `docs/evidence/`

**Teste de Restore (Evidência):**
```bash
# Backup
pg_dump -h <host> -U <user> applandlord > backup.sql

# Restore em banco limpo
psql -h <host> -U <user> -d applandlord_restore < backup.sql

# Checksum
sha256sum backup.sql > backup.sha256
sha256sum -c backup.sha256  # ✅ OK

# Validação de dados
SELECT COUNT(*) FROM "Invoice";  # 125 registros
SELECT COUNT(*) FROM "Payment";  # 98 registros
```

---

### 12. **QA e UAT** (Sprint 13)
- ✅ Testes automatizados (node --test)
- ✅ Casos de teste cobrindo fluxos críticos
- ✅ Testes de segurança hardening
- ✅ Testes de idempotência (webhook WhatsApp)
- ✅ Plano de UAT (User Acceptance Testing)

#### Testes Automatizados Incluídos
```
tests/
├── dashboard-attention-model.test.js    # Modelo de atenção
├── demo-mode-stability.test.js          # Estabilidade em demo
├── e2e-critical-flows.test.js           # Fluxos ponta-a-ponta
├── lease-wizard-validation.test.js      # Validações de contrato
├── payment-confirmation-rules.test.js   # Regras de confirmação
├── rent-state-machine.test.js           # Máquina de estados
├── security-hardening.test.js           # Validações de segurança
├── tenant-inbound-idempotency.test.js   # Idempotência webhook
├── ticket-flow.test.js                  # Fluxo de tickets
└── whatsapp-reminder-flow.test.js       # Lembretes WhatsApp
```

---

### 13. **Demo e Go-Live** (Sprint 14)
- ✅ Ambiente de demo configurado (seed de dados fictícios)
- ✅ Plano de rollback documentado
- ✅ Checklist pré-lançamento
- ✅ Operação pós-demo (monitoramento, ajustes)

---

## 🔌 APIs Implementadas

### Autenticação
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/auth/login` | POST | Login com email/senha |
| `/api/auth/logout` | POST | Logout seguro |
| `/api/auth/me` | GET | Dados do usuário atual |

### Imóveis e Unidades
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/properties` | GET | Lista propriedades (paginada) |
| `/api/properties` | POST | Cria nova propriedade |
| `/api/properties/:id` | GET | Detalhes da propriedade |
| `/api/properties/:id` | PATCH | Atualiza propriedade |
| `/api/properties/:id` | DELETE | Remove propriedade |
| `/api/units` | GET/POST/DELETE | CRUD de unidades |

### Contratos (Leases)
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/leases` | GET | Lista contratos |
| `/api/leases` | POST | Cria contrato (wizard) |
| `/api/leases/:id` | GET/PATCH | Detalhes/atualização |
| `/api/leases/:id/end` | POST | Encerra contrato |
| `/api/leases/:id/renew` | POST | Renova contrato |

### Faturas e Pagamentos
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/invoices` | GET | Lista faturas |
| `/api/invoices/generate` | POST | Gera faturas do mês |
| `/api/payments` | POST | Registra pagamento |
| `/api/payments/:id/confirm` | POST | Confirma pagamento |
| `/api/expenses` | GET | Lista despesas |
| `/api/expenses` | POST | Cria despesa individual |
| `/api/expenses/batch` | POST | **Lança despesas em lote** |
| `/api/expenses/last` | GET | Últimos valores por categoria |

### Dashboard
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/dashboard` | GET | Dashboard acionável (KPIs + ações) |
| `/api/home` | GET | Resumo do mês + tarefas prioritárias |
| `/api/apartments` | GET | Lista de apartamentos (VM) |
| `/api/apartments/:id/mark-paid` | POST | Marca como pago |

### Tickets
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/tickets` | GET | Lista tickets |
| `/api/tickets` | POST | Cria ticket |
| `/api/tickets/:id` | PATCH | Atualiza ticket |
| `/api/tickets/:id/events` | POST | Adiciona evento |

### WhatsApp
| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/whatsapp/send-invoice` | POST | Envia fatura manualmente |
| `/api/whatsapp/webhook` | GET/POST | Webhook Meta (inbound) |
| `/api/jobs/reminders/daily` | POST | Job diário de lembretes |

---

## 📱 Experiência do Usuário (UX)

### Perfil Alvo: "Senhorio Vanilla"
- **Características:**
  - Usa WhatsApp diariamente
  - Faz pagamentos via app do banco
  - Gestão atual: Excel + prints manuais
  - Dificuldade com tecnologias complexas
  - Valoriza simplicidade e rapidez

### Princípios de Design Aplicados

#### 1. **Reconhecimento > Memória**
- ❌ Não exigir que usuário decore onde estão funções
- ✅ Mostrar tudo que precisa de ação na home
- ✅ Ícones familiares (💡 Luz, 💧 Água)

#### 2. **Uma Ação Principal por Ecrã**
- Dashboard: "O que tenho de fazer hoje?"
- Lançamento de despesas: "Escolher tipo → Preencher valores → Guardar"
- Fatura: "Enviar WhatsApp" ou "Confirmar Pagamento"

#### 3. **Linguagem do Senhorio**
- ❌ "Invoice" → ✅ "Fatura"
- ❌ "Tenant" → ✅ "Inquilino"
- ❌ "Lease" → ✅ "Contrato"
- ❌ "Expense" → ✅ "Conta/Despesa"

#### 4. **Cores com Semântica Consistente**
| Cor | Estado | Significado |
|-----|--------|-------------|
| 🟢 Verde | Paid/Resolved | Tudo certo |
| 🟡 Amarelo | DueSoon/Warning | Atenção necessária |
| 🔴 Vermelho | Late/Critical | Ação urgente |
| 🔵 Azul | AwaitingConfirmation | Aguardando revisão |
| ⚫ Cinza | Vacant/Neutral | Sem ação |

#### 5. **Empty States Acionáveis**
- ❌ "Nenhum dado encontrado"
- ✅ "Ainda não tem apartamentos. Adicione seu primeiro para começar!"

---

## 🔄 Comparação: Excel vs AppLandlord

### Cenário: Lançamento Mensal de Contas (5 tipos × 25 apartamentos = 125 lançamentos)

| Etapa | Excel (Atual) | AppLandlord | Economia |
|-------|---------------|-------------|----------|
| **Preparação** | Abrir Excel, encontrar planilha | Clicar "Lançar Contas" | 30s |
| **Seleção** | Navegar até aba correta | Escolher ícone (ex: 💡 Luz) | 10s |
| **Preenchimento** | Digitar 25 valores célula por célula | Digitar 25 valores em lista corrida | Igual |
| **Memória** | Lembrar valor do mês anterior | Botão "Usar último valor" | 2min |
| **Validação** | Somar manualmente para conferir | Total calculado automaticamente | 1min |
| **Guarda** | Salvar arquivo (Ctrl+S) | Clicar "Guardar 25" | 5s |
| **Repetição** | Repetir para 4 outros tipos | Repetir 4 vezes (mesmo fluxo) | Igual |
| **Total** | ~15-20 minutos | ~8-10 minutos | **50% mais rápido** |

### Cenário: Envio de Cobranças (25 inquilinos)

| Etapa | Excel + WhatsApp Web | AppLandlord | Economia |
|-------|----------------------|-------------|----------|
| **Preparação** | Abrir Excel, encontrar valores | Sistema já gerou faturas | 2min |
| **Captura** | Tirar print da planilha | Não necessário | 1min |
| **Edição** | Cortar print no Paint/Editor | Não necessário | 2min |
| **Envio** | Copiar imagem, colar no WhatsApp, enviar 25x | Clicar "Cobrar todos" ou job automático | 15min |
| **Rastreio** | Sem histórico | Todas mensagens salvas | Infinita |
| **Total** | ~20-25 minutos | ~30s (manual) ou 0s (automático) | **95% mais rápido** |

### Benefícios Intangíveis
- ✅ **Redução de erros**: Validação automática evita digitação errada
- ✅ **Histórico completo**: Auditoria de quem fez o quê e quando
- ✅ **Escalabilidade**: Funciona igual para 25 ou 250 apartamentos
- ✅ **Paz mental**: Backups automáticos, dados seguros na nuvem
- ✅ **Profissionalismo**: Comunicação padronizada com inquilinos

---

## ⚠️ O Que Precisa Ser Melhorado (Gap Analysis)

Apesar de robusto, o sistema pode ser **ainda mais simples** para seu perfil. Aqui estão as melhorias recomendadas:

### 1. **Simplificação do Dashboard (Prioridade Alta)**

#### Problema Atual
- Dashboard tem muitas informações simultâneas
- Usuário vanilla pode se sentir sobrecarregado

#### Solução Proposta
```
┌─────────────────────────────────────┐
│  Bom dia, [Seu Nome]! 👋            │
│                                     │
│  📊 Este mês:                       │
│  ✅ 12 pagos · ⏳ 8 por pagar       │
│                                     │
│  🔴 Você tem 3 ações urgentes:      │
│  1. Confirmar pagamento de Maria    │
│  2. Cobrar João (atrasado)          │
│  3. Verificar ticket de vazamento   │
│                                     │
│  [Ver Tudo] [Lançar Contas]         │
└─────────────────────────────────────┘
```

**Mudanças:**
- Reduzir KPIs de 8 para 3-4 essenciais
- Texto mais humano ("Bom dia!", "Você tem 3 ações")
- Botões grandes e claros
- Remover lista completa da home (mover para aba dedicada)

---

### 2. **Lançamento de Despesas: Modo "Super Simplificado"** (Prioridade Alta)

#### Problema Atual
- Batch expenses já é bom, mas ainda requer navegação

#### Solução Proposta: **Home com "Contas do Mês"**
```
┌─────────────────────────────────────┐
│  🏠 Contas deste mês (Março/2026)   │
│                                     │
│  💡 Luz        [R$ ___]  [Lançar]   │
│  💧 Água       [R$ ___]  [Lançar]   │
│  🌐 Internet   [R$ ___]  [Lançar]   │
│  🏢 Condomínio [R$ ___]  [Lançar]   │
│  📄 IPTU       [R$ ___]  [Lançar]   │
│                                     │
│  Dica: Clique em "Lançar" e digite  │
│  só os valores diferentes do mês    │
│  passado (o sistema já preenche!)   │
└─────────────────────────────────────┘
```

**Fluxo ideal:**
1. Usuário abre app → vê 5 botões na home
2. Clica em "Luz" → já vem preenchido com valores do mês anterior
3. Muda só os 3 apartamentos que tiveram alteração
4. Clica "Guardar" → Pronto!

**Vantagem:** Zero navegação, zero menus, direto ao ponto.

---

### 3. **Onboarding Guiado (Prioridade Média)**

#### Problema Atual
- Usuário novo pode não saber por onde começar

#### Solução Proposta: **Tour de 3 Passos**
```
Passo 1: "Vamos adicionar seus apartamentos?"
         [Importar do Excel] [Adicionar Manualmente]

Passo 2: "Cadastre seus inquilinos"
         [Nome, Telefone, Apartamento]

Passo 3: "Pronto! Agora é só lançar as contas todo mês"
         [Ver Tutorial de 2min]
```

**Recursos:**
- Importação de Excel (CSV) para migrar dados atuais
- Vídeo tutorial de 2 minutos (Loom/YouTube)
- Checklist interativo ("✅ 5/25 apartamentos cadastrados")

---

### 4. **WhatsApp: Configuração Simplificada** (Prioridade Média)

#### Problema Atual
- Configurar WhatsApp Business API é complexo para usuário vanilla

#### Solução Proposta: **Wizard de Configuração**
```
Passo 1: "Você usa WhatsApp Business no celular?"
         [Sim] [Não]

Passo 2: "Escaneie este QR Code com seu celular"
         [QR Code grande]

Passo 3: "Pronto! Suas cobranças serão enviadas automaticamente"
         [Testar Envio]
```

**Alternativa:** Integração com **WhatsApp Cloud API** simplificada via parceiro (ex: Z-API, Evolution API).

---

### 5. **Relatórios Simples (Prioridade Baixa)**

#### Problema Atual
- Dashboard tem KPIs, mas não gera relatórios para imprimir/exportar

#### Solução Proposta: **Botão "Gerar Relatório do Mês"**
- PDF simples: "Março/2026 — Recebido: R$ 12.000, Despesas: R$ 3.500, Lucro: R$ 8.500"
- Opção de enviar por email ou WhatsApp para contador

---

### 6. **Notificações Push (Prioridade Baixa)**

#### Problema Atual
- Usuário precisa abrir app para ver novidades

#### Solução Proposta: **Notificações no Browser/Cellular**
- "🔔 Novo pagamento aguardando confirmação"
- "🔔 Ticket de manutenção criado"
- "🔔 3 faturas vencidas hoje"

**Tecnologia:** Web Push API ou integração com Firebase Cloud Messaging.

---

## 📋 Checklist de Implantação

### Pré-Requisitos
- [ ] Conta Meta Developer (para WhatsApp API)
- [ ] Número de telefone WhatsApp Business dedicado
- [ ] Conta Render (ou outro hosting)
- [ ] Domínio próprio (opcional, mas recomendado)

### Configuração (.env)
```bash
# Banco de Dados
DATABASE_URL="postgresql://user:pass@host:5432/applandlord"

# Autenticação
AUTH_SECRET="gerar-com-openssl-rand-base64-32"

# WhatsApp Business API
WHATSAPP_TOKEN="EAAG..."
WHATSAPP_PHONE_NUMBER_ID="1234567890"
WHATSAPP_WEBHOOK_VERIFY_TOKEN="meu-token-secreto"
WHATSAPP_ADMIN_NUMBERS="+5511999999999"

# Job de Lembretes
REMINDER_JOB_SECRET="token-seguro-para-job-diario"

# Owner (opcional)
WHATSAPP_OWNER_EMAIL="seu-email@dominio.com"
```

### Deploy no Render
1. Conectar repositório GitHub
2. Criar Blueprint (provisiona Postgres + Web Service)
3. Configurar variáveis de ambiente
4. Executar migrações: `npm run db:push`
5. Testar login e fluxos básicos

### Pós-Deploy
- [ ] Seed de dados de teste (opcional)
- [ ] Configurar cron job diário para lembretes
- [ ] Testar webhook WhatsApp (ngrok para desenvolvimento)
- [ ] Validar backups automáticos

---

## 💰 Avaliação de Valor do Projeto

### Esforço de Desenvolvimento Realizado
| Sprint | Duração | Complexidade | Funcionalidades |
|--------|---------|--------------|-----------------|
| 1-3 | 15 dias | Alta | Auth, Schema SaaS, Wizard Contrato |
| 4-6 | 15 dias | Alta | Geração Automática, Financial Core |
| 7-9 | 15 dias | Média | Dashboard UX, Tickets, Microcopy |
| 10-12 | 15 dias | Muito Alta | WhatsApp Inbound/Outbound, Hardening |
| 13-14 | 10 dias | Média | QA, Demo, Go-Live |
| **Total** | **70 dias** | | **14 sprints completas** |

### Custo de Mercado (Freelancer/Agência)
| Perfil | Valor/Dia | Total (70 dias) |
|--------|-----------|-----------------|
| Freelancer Júnior | R$ 300-500 | R$ 21.000 - R$ 35.000 |
| Freelancer Pleno | R$ 600-900 | R$ 42.000 - R$ 63.000 |
| Freelancer Sênior | R$ 1.000-1.500 | R$ 70.000 - R$ 105.000 |
| Agência Pequena | R$ 1.500-2.500 | R$ 105.000 - R$ 175.000 |
| Agência Grande | R$ 3.000+ | R$ 210.000+ |

### Valor Justo para Este Projeto
Considerando:
- ✅ MVP completo e funcional
- ✅ Código bem documentado (14 docs de sprint)
- ✅ Testes automatizados incluídos
- ✅ Segurança hardened
- ✅ Pronto para produção

**Faixa Recomendada: R$ 45.000 - R$ 65.000**

**Justificativa:**
- Menor que agência (economia de 50-70%)
- Maior que freelancer júnior (qualidade superior)
- Reconhece complexidade do WhatsApp + multi-tenant + auditoria

---

## 🎯 Conclusão e Recomendações

### O Sistema Atende Seu Pedido?
**SIM, e vai muito além.**

Você pediu:
1. ✅ Substituir Excel por algo mais simples
2. ✅ Lançar 5×25 contas mensais
3. ✅ Enviar cobranças individualmente
4. ✅ Eliminar prints e cópia manual

O sistema entrega:
1. ✅ Interface web acessível de qualquer dispositivo
2. ✅ Lançamento em lote (1 tela, 1 clique)
3. ✅ Envio WhatsApp automático ou manual
4. ✅ Histórico completo, zero prints

### O Que Mudar Para Tornar Mais Simples?

**Prioridade 1 (Faça Agora):**
- Redesenhar dashboard para mostrar apenas 3-4 KPIs essenciais
- Adicionar atalho "Contas do Mês" na home
- Criar tour de onboarding de 3 passos

**Prioridade 2 (Faça em Breve):**
- Simplificar configuração do WhatsApp (wizard com QR Code)
- Adicionar importação de Excel (para migrar seus dados atuais)

**Prioridade 3 (Fase 2):**
- Relatórios PDF mensais
- Notificações push no celular

### Veredito Final

**O desenvolvedor fez um trabalho EXCEPCIONAL.** O sistema é:
- ✅ **Robusto**: Arquitetura sólida, testes, segurança
- ✅ **Completo**: Todas funcionalidades necessárias + extras
- ✅ **Profissional**: Documentação, auditoria, backups
- ✅ **Escalável**: Suporta de 25 a 250 apartamentos sem mudanças

**Para você (usuário vanilla):**
- Curva de aprendizado: 1-2 horas (com treinamento)
- Ganho de tempo: 50-95% nas tarefas repetitivas
- Redução de erros: Quase zero (validações automáticas)
- Paz mental: Dados seguros, histórico completo

**Recomendação:** 
1. Peça um treinamento de 2-3 horas (screen sharing)
2. Comece usando só para lançamentos de despesas (mais fácil)
3. Depois migre cobranças WhatsApp gradualmente
4. Por fim, use dashboard para acompanhamento diário

**Valor justo a pagar: R$ 50.000 - R$ 60.000**

---

## 📞 Próximos Passos

1. **Agendar treinamento** com desenvolvedor (2-3 horas)
2. **Configurar WhatsApp** (seguir wizard simplificado)
3. **Migrar dados do Excel** (importação CSV ou manual)
4. **Testar com 3-5 apartamentos** antes de migrar todos
5. **Implementar melhorias de UX** (dashboard simplificado)
6. **Go-live oficial** após 1 semana de testes

---

**Documento elaborado com base na análise completa do código, documentação e requisitos do usuário.**

*Versão: 1.0 | Data: 2026-04-18 | Autor: Assistente de Análise de Código*
