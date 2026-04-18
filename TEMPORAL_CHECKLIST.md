# Checklist Temporal do Projeto (70 dias úteis)

> Regra: este checklist replica **exatamente** a sequência temporal proposta (14 semanas / 70 dias úteis).

> Regra adicional: toda implementação deve documentar função por função (objetivo, entradas, saídas, erros, efeitos colaterais e testes).

## Semana 1 (Dias 1–5) — Arquitetura e planeamento técnico
- [x] Definir backlog fechado MVP vs Fase 2
- [x] Definir contratos de API (input/output/status)
- [x] Definir convenção de estados (lease/rent/ticket/payment/reminder)
- [x] Definir estratégia de migrations (sem downtime)
- [x] Criar documento de arquitetura v1

## Semana 2 (Dias 6–10) — Auth + tenancy base
- [x] Implementar autenticação (Supabase Auth ou NextAuth)
- [x] Introduzir `owner_id` nas entidades core
- [x] Middleware de sessão nas rotas
- [x] Filtro por owner em APIs de leitura/escrita
- [x] Migração dos dados existentes

## Semana 3 (Dias 11–15) — Modelo de dados robusto
- [x] Criar tabelas: `expenses`, `reminders`, `whatsapp_messages`, `audit_logs`
- [x] Ajustar `invoices -> rent_charges` (ou manter naming e evoluir estados)
- [x] Constraint: 1 contrato ativo por imóvel/unidade
- [x] Índices para overdue, due_date, status, owner
- [x] Eventos de auditoria para ações críticas

## Semana 4 (Dias 16–20) — Fluxo contrato (wizard)
- [x] Criar wizard em 4–5 passos
- [x] Passo inquilino: criar ou selecionar existente
- [x] Validações de consistência (imóvel disponível, due_day, datas)
- [x] Confirm screen com resumo
- [x] Mensagens de erro legíveis

## Semana 5 (Dias 21–25) — Geração automática de rendas + estados
- [x] Geração automática de rendas por período
- [x] Máquina de estados de renda
- [x] Endpoint para transições seguras
- [x] Logs de transição de estado
- [x] Testes de transição inválida

## Semana 6 (Dias 26–30) — Pagamento e despesas (núcleo financeiro)
- [x] Registo de pagamento com comprovativo opcional
- [x] Confirmação manual final pelo senhorio
- [x] CRUD de despesas (imóvel e/ou contrato)
- [x] Cálculo de lucro líquido mensal
- [x] Ajustes nos agregados do dashboard

## Semana 7 (Dias 31–35) — Dashboard “Atenção necessária”
- [x] Header com resumo humano do dia
- [x] Bloco “Ações rápidas” (5 CTAs principais)
- [x] Bloco “Atenção necessária” com prioridade
- [x] KPIs MVP (6–8) com links acionáveis
- [x] Estados visuais e cores consistentes

## Semana 8 (Dias 36–40) — UX de foco e microcopy
- [x] 1 CTA primário por ecrã
- [x] Microcopy em linguagem de senhorio
- [x] Empty states orientados à ação
- [x] Erros e confirmações com texto claro
- [x] Revisão visual para demo (consistência e acabamento)

## Semana 9 (Dias 41–45) — Tickets operacionais
- [x] Criar ticket manual no painel
- [x] Estados: new/triaged/waiting/resolved/closed
- [x] Timeline de eventos do ticket
- [x] Link ticket <-> imóvel <-> contrato <-> inquilino
- [x] Prioridades e filtros úteis

## Semana 10 (Dias 46–50) — WhatsApp outbound real
- [ ] Templates WhatsApp para lembrete/atraso/confirmação
- [ ] Job diário de reminders
- [ ] Retry básico em falhas de envio
- [ ] Persistência de mensagens enviadas/estado
- [ ] Botão “Cobrar agora” no painel ligado ao fluxo

## Semana 11 (Dias 51–55) — WhatsApp inbound (inquilino)
- [x] Parser simples de intenção (“já paguei”, “problema”, “pago amanhã”)
- [x] Estado `tenant_claimed_paid` + `awaiting_confirmation`
- [x] Criação de ticket por palavras-chave
- [x] Ligação correta número -> inquilino -> contrato ativo
- [x] Proteções anti-duplicação e throttling

## Semana 12 (Dias 56–60) — Segurança e estabilidade
- [ ] Endurecer validações backend
- [ ] Rate limits em endpoints críticos
- [ ] Logs estruturados de erro
- [ ] Backups e restore testado
- [ ] Revisão de permissões e segredos

## Semana 13 (Dias 61–65) — QA final + UAT
- [ ] Testes E2E de 6 fluxos críticos
- [ ] Testes manuais de edge cases
- [ ] Correção de bugs P0/P1
- [ ] Script de seed para demo consistente
- [ ] Checklist de release

## Semana 14 (Dias 66–70) — Demo final + go-live controlado
- [ ] Script de demo de 10 minutos
- [ ] Dados fictícios de impacto (atrasos, ticket urgente, contrato a expirar)
- [ ] Versão “demo mode” estável
- [ ] Materiais de apresentação (dor -> solução -> valor)
- [ ] Plano pós-demo (próximos 30 dias)
