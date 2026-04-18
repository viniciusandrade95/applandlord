# Constituição do Produto v1

**Produto:** Applandlord  
**Versão:** 1.0  
**Data:** 18 de abril de 2026  
**Estado:** Ativa

## Preâmbulo
Esta Constituição define as regras fundamentais, a estrutura teórica e os princípios de execução do Applandlord, para garantir um produto simples, confiável, escalável e orientado à atenção do senhorio.

## Artigo 1 — Missão do Produto
O Applandlord existe para ajudar senhorios a gerir arrendamentos com clareza, rapidez e controlo operacional, integrando browser e WhatsApp num único sistema.

## Artigo 2 — Entidade Central
A entidade central do sistema é o **Contrato de Arrendamento (Lease)**.

Toda a arquitetura funcional deriva desta cadeia:

**Imóvel → Contrato → Inquilino → Renda Mensal → Pagamento/Cobrança → Despesa → Ticket → Histórico**

## Artigo 3 — Regras de Negócio Fundamentais
1. Um inquilino pode ter múltiplos contratos (histórico e/ou imóveis distintos).
2. Um imóvel/unidade só pode ter **um contrato ativo** de cada vez.
3. A criação de inquilino acontece dentro do fluxo “Criar contrato”.
4. Despesas podem ser associadas a imóvel e/ou contrato.
5. Mensagem “já paguei” nunca marca pagamento como definitivo automaticamente.
6. Tickets podem nascer via painel web ou via WhatsApp.
7. Todo o dado pertence a um dono (`owner_id`) e deve ser isolado por conta.

## Artigo 4 — Princípios de UX e Psicologia da Atenção
1. **Uma ação principal por ecrã.**
2. **Reconhecimento > memória** (mostrar o que precisa de ação, sem exigir procura em menus).
3. **Linguagem do senhorio** (sem jargão técnico).
4. **Hierarquia visual forte** (CTA principal claro).
5. **Cores com semântica consistente:**
   - Verde: pago/resolvido
   - Amarelo: a vencer
   - Vermelho: atraso/urgente
   - Azul: aguarda confirmação
6. A home deve responder em 5 segundos: **“O que tenho de fazer hoje?”**

## Artigo 5 — Estrutura de Domínio (Modelo Teórico)
### Entidades nucleares
- `profiles/users`
- `properties`
- `units` (quando aplicável)
- `tenants` (ou `renters`)
- `leases`
- `rent_charges` (ou `invoices`)
- `payments`
- `expenses`
- `tickets`
- `ticket_events`
- `reminders`
- `whatsapp_messages`
- `audit_logs`

### Regras de integridade obrigatórias
- Constraint única para 1 contrato ativo por imóvel/unidade.
- Relações referenciais consistentes (contrato liga imóvel + inquilino).
- Auditoria de ações críticas.

## Artigo 6 — Máquina de Estados Oficial
### Renda
`pending → due_soon → late → reminder_sent → tenant_claimed_paid → awaiting_confirmation → paid`  
Estados complementares: `partial | disputed | cancelled`

### Contrato
`draft → active → ended/terminated → renewed`

### Ticket
`new → triaged → waiting_landlord/waiting_tenant → scheduled → resolved → closed`

## Artigo 7 — Arquitetura Funcional Mínima (MVP)
O MVP funcional deve conter:
1. Auth + isolamento por conta
2. Gestão de imóveis
3. Criação de contrato em wizard
4. Geração automática de rendas
5. Fluxo de cobrança e lembretes
6. Fluxo de confirmação de pagamento
7. Gestão de despesas
8. Gestão de tickets
9. Integração WhatsApp inbound/outbound com rastreio

## Artigo 8 — Dashboard Oficial
A dashboard deve ter 4 blocos:
1. **Resumo humano do dia**
2. **Ações rápidas**
3. **Atenção necessária** (lista acionável por prioridade)
4. **Métricas essenciais (6–8)**

### KPIs mínimos do MVP
- Renda esperada (mês)
- Renda recebida
- Renda em atraso
- Rendas a vencer em 7 dias
- Despesas do mês
- Lucro líquido estimado
- Tickets abertos
- Contratos a expirar

## Artigo 9 — WhatsApp (Política Operacional)
1. WhatsApp é canal operacional de cobrança, confirmação e tickets.
2. Mensagens enviadas e recebidas devem ficar persistidas.
3. Fora da janela conversacional aplicável, usar templates aprovados.
4. O sistema pode sugerir estados, mas a confirmação final de “pago” é do senhorio.
5. Mensagens devem ser idempotentes e auditáveis.

## Artigo 10 — Segurança, Governança e Auditoria
1. Autenticação obrigatória.
2. Autorização por `owner_id` em todas as consultas.
3. Registo de eventos críticos em `audit_logs`.
4. Proteção de webhooks (assinatura, rate limit, idempotência).
5. Política de backup e recuperação testada.

## Artigo 11 — Qualidade e Critérios de Pronto
Uma funcionalidade só é “pronta” quando:
- regra de negócio está validada;
- erro e estado limite estão cobertos;
- logs essenciais estão disponíveis;
- UX está clara para utilizador não técnico;
- foi testada no fluxo ponta-a-ponta.

## Artigo 12 — Não-Objetivos (para evitar overengineering)
Não entram no MVP:
- IA avançada para classificação complexa de tickets;
- automação financeira sem confirmação humana;
- funcionalidades enterprise de múltiplas equipas/roles complexas;
- dashboards analíticas profundas de fase 2.

## Artigo 13 — Roadmap Constitucional
- **Fase 1:** fundações SaaS (auth, tenancy, schema robusto)
- **Fase 2:** fluxo núcleo (contrato, renda, pagamento, despesa)
- **Fase 3:** UX de atenção + dashboard acionável
- **Fase 4:** WhatsApp tenant flow real
- **Fase 5:** hardening, QA e operação real
- **Fase 6:** demo comercial e rollout controlado

## Artigo 14 — Cláusula de Evolução
Alterações a esta Constituição exigem:
1. explicitação de trade-offs,
2. impacto no MVP e no prazo,
3. decisão registada no changelog de produto.

## Assinatura de Produto
**“Simples o suficiente para usar todos os dias. Robusta o suficiente para confiar com dinheiro real.”**
