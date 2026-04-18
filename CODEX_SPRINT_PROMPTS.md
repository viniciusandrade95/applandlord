# Prompts Individuais por Sprint para o Codex

Este documento contém **14 prompts individuais**, um por sprint (70 dias úteis), prontos para colar no Codex.

## Contrato obrigatório de execução (aplica-se a todos os sprints)
Copiar este bloco no início de cada prompt:

```txt
Regras obrigatórias desta execução:
1) Para cada função criada/alterada, documentar:
   - objetivo;
   - entradas (tipos, validações, exemplos);
   - saídas (tipo, formato, exemplos);
   - erros possíveis;
   - efeitos colaterais (DB, APIs, jobs, fila, storage).
2) Para cada endpoint/API criado/alterado, documentar:
   - contrato de entrada (body/query/params/headers);
   - contrato de saída (status code + payload);
   - regras de autenticação/autorização;
   - erros e mensagens.
3) Para cada mudança de dados, documentar:
   - schema/tabelas afetadas;
   - migração;
   - impacto em dados existentes;
   - plano de rollback.
4) Para cada feature, incluir:
   - como testar manualmente (passo a passo);
   - testes automatizados executados;
   - evidência do resultado.
5) Atualizações obrigatórias no repo:
   - CHANGELOG.md;
   - TEMPORAL_CHECKLIST.md (marcar progresso da semana);
   - documentação técnica relacionada.

Formato obrigatório da resposta final:
A) Resumo executivo
B) Arquivos alterados
C) Função por função (objetivo, entrada, saída, erros, efeitos)
D) APIs alteradas (contratos de entrada/saída)
E) Banco de dados/migrações
F) Como testar (manual + automatizado)
G) Limitações e próximos passos
```

---

## Sprint 1 (Dias 1–5) — Arquitetura e planeamento técnico
```txt
Quero que executes o Sprint 1 no repo applandlord.

Objetivo:
Fechar arquitetura técnica, contratos de API e convenções de estado para evitar retrabalho.

Tarefas:
1) Definir backlog final MVP vs Fase 2.
2) Definir contrato base de APIs (inputs/outputs/erros).
3) Definir convenção de estados para lease/rent/payment/ticket/reminder.
4) Definir estratégia de migrations sem downtime.
5) Criar documento de arquitetura v1.

Entregáveis:
- Documento técnico com decisões e trade-offs.
- Tabela de entradas e saídas das APIs principais.
- Critérios de aceite por módulo.
- Atualização de CHANGELOG.md e TEMPORAL_CHECKLIST.md.

Aplicar integralmente o “Contrato obrigatório de execução”.
```

## Sprint 2 (Dias 6–10) — Auth + tenancy base
```txt
Quero que executes o Sprint 2 no repo applandlord.

Objetivo:
Implementar autenticação e base de isolamento por conta (owner).

Tarefas:
1) Adicionar auth (Supabase Auth ou NextAuth).
2) Adicionar owner_id nas entidades core.
3) Proteger rotas com sessão.
4) Filtrar queries por owner.
5) Migrar dados existentes.

Entregáveis:
- Login/logout funcional.
- Rotas protegidas.
- Documento de autorização por endpoint.
- Atualização de CHANGELOG.md e TEMPORAL_CHECKLIST.md.

Aplicar integralmente o “Contrato obrigatório de execução”.
```

## Sprint 3 (Dias 11–15) — Modelo de dados robusto
```txt
Quero que executes o Sprint 3 no repo applandlord.

Objetivo:
Evoluir schema para operação SaaS robusta.

Tarefas:
1) Criar tabelas: expenses, reminders, whatsapp_messages, audit_logs.
2) Ajustar invoices para rent_charges (ou justificar manutenção do naming).
3) Garantir regra de 1 contrato ativo por imóvel/unidade via constraint.
4) Criar índices essenciais.
5) Registrar eventos críticos em auditoria.

Entregáveis:
- Migrações completas com rollback.
- Documento de modelo de dados (ER simplificado).
- Matriz de entradas/saídas por tabela.
- Atualização de CHANGELOG.md e TEMPORAL_CHECKLIST.md.

Aplicar integralmente o “Contrato obrigatório de execução”.
```

## Sprint 4 (Dias 16–20) — Fluxo contrato (wizard)
```txt
Quero que executes o Sprint 4 no repo applandlord.

Objetivo:
Criar wizard de contrato com criação/seleção de inquilino no fluxo.

Tarefas:
1) Implementar wizard em 4–5 passos.
2) Implementar passo de criação/seleção de inquilino.
3) Validar consistência de imóvel, unidade, datas e due_day.
4) Criar tela de confirmação.
5) Tratar erros com mensagens claras.

Entregáveis obrigatórios:
- Fluxo completo funcional no frontend e backend.
- Documento de UX do wizard (estados e transições).
- Testes de validação de entrada/saída.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Cada função do wizard, validações, entradas, saídas e testes.
```

## Sprint 5 (Dias 21–25) — Geração automática de rendas + estados

```txt
Quero que executes o Sprint 5 no repo applandlord.

Objetivo:
- Automatizar geração de rendas e máquina de estados.

Tarefas:
1) Gerar rendas por período a partir do contrato.
2) Implementar máquina de estados de cobrança.
3) Criar endpoint seguro para transições.
4) Registrar logs de transição.
5) Implementar testes de transição inválida.

Entregáveis obrigatórios:
- Serviço de geração automática.
- Documento de estados e regras de transição.
- Casos de teste manuais e automatizados.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Entradas/saídas de cada função de estado.
- Como testar cada transição.
```

## Sprint 6 (Dias 26–30) — Pagamento e despesas

```txt
Quero que executes o Sprint 6 no repo applandlord.

Objetivo:
- Fechar núcleo financeiro: pagamentos com confirmação e despesas.

Tarefas:
1) Registrar pagamento com comprovativo opcional.
2) Implementar estado awaiting_confirmation e confirmação final manual.
3) Implementar CRUD de despesas por imóvel/contrato.
4) Atualizar cálculo de lucro líquido.
5) Ajustar dashboard financeiro.

Entregáveis obrigatórios:
- Fluxo ponta-a-ponta de pagamento confirmado.
- Documento de contratos de entrada/saída das rotas financeiras.
- Testes das regras de confirmação.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Funções financeiras, parâmetros e retornos.
- Como testar cenários de erro e borda.
```

## Sprint 7 (Dias 31–35) — Dashboard de atenção

```txt
Quero que executes o Sprint 7 no repo applandlord.

Objetivo:
- Transformar dashboard em painel acionável de atenção diária.

Tarefas:
1) Criar resumo humano do dia.
2) Criar bloco de ações rápidas.
3) Criar bloco atenção necessária por prioridade.
4) Exibir 6–8 KPIs acionáveis.
5) Aplicar cores e estados consistentes.

Entregáveis obrigatórios:
- Dashboard revisada com foco em ação.
- Documento de mapeamento KPI -> ação.
- Testes de rendering e dados.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Fontes de dados, entradas, saídas e fallback de UI.
```

## Sprint 8 (Dias 36–40) — UX de foco e microcopy

```txt
Quero que executes o Sprint 8 no repo applandlord.

Objetivo:
- Melhorar clareza, linguagem e redução de carga cognitiva.

Tarefas:
1) Garantir 1 CTA principal por ecrã.
2) Revisar microcopy para linguagem de senhorio.
3) Criar empty states orientados à ação.
4) Melhorar mensagens de erro/sucesso.
5) Uniformizar consistência visual para demo.

Entregáveis obrigatórios:
- Guia de microcopy v1.
- Lista de alterações UX com racional.
- Testes manuais guiados de usabilidade.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Cada componente alterado: entradas, saídas, estados visuais.
```

## Sprint 9 (Dias 41–45) — Tickets operacionais

```txt
Quero que executes o Sprint 9 no repo applandlord.

Objetivo:
- Consolidar fluxo de tickets com rastreabilidade.

Tarefas:
1) Implementar criação e gestão de ticket no painel.
2) Implementar estados formais do ticket.
3) Implementar timeline de eventos.
4) Ligar ticket a imóvel/contrato/inquilino.
5) Implementar filtros por prioridade e status.

Entregáveis obrigatórios:
- Módulo de tickets operacional.
- Documento de máquina de estados do ticket.
- Testes de fluxo completo.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Entradas/saídas das rotas de ticket e eventos.
```

## Sprint 10 (Dias 46–50) — WhatsApp outbound

```txt
Quero que executes o Sprint 10 no repo applandlord.

Objetivo:
- Automatizar cobranças e lembretes por WhatsApp.

Tarefas:
1) Configurar templates de cobrança/lembrete.
2) Implementar job diário de reminders.
3) Implementar retry básico em falhas.
4) Persistir mensagens e status de entrega.
5) Integrar botão cobrar agora com envio.

Entregáveis obrigatórios:
- Fluxo outbound operacional com logs.
- Documento de payloads de envio e retorno.
- Plano de teste com simulação de falhas.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Funções de integração WhatsApp e contratos IO.
```

## Sprint 11 (Dias 51–55) — WhatsApp inbound (inquilino)

```txt
Quero que executes o Sprint 11 no repo applandlord.

Objetivo:
- Processar respostas do inquilino com segurança.

Tarefas:
1) Implementar parser de intenção (já paguei/problema/pago amanhã).
2) Aplicar estados tenant_claimed_paid e awaiting_confirmation.
3) Criar tickets por palavras-chave.
4) Resolver relação número -> inquilino -> contrato ativo.
5) Implementar proteção anti-duplicação e throttling.

Entregáveis obrigatórios:
- Fluxo inbound funcional e rastreável.
- Documento de regras de interpretação de mensagens.
- Testes de idempotência e concorrência.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Entradas/saídas por webhook e efeitos em DB.
```

## Sprint 12 (Dias 56–60) — Segurança e estabilidade

```txt
Quero que executes o Sprint 12 no repo applandlord.

Objetivo:
- Endurecer segurança e estabilidade operacional.

Tarefas:
1) Reforçar validações backend.
2) Implementar rate limits.
3) Melhorar logs estruturados de erro.
4) Testar backup e restore.
5) Revisar permissões e segredos.

Entregáveis obrigatórios:
- Relatório de hardening.
- Checklist de segurança preenchida.
- Evidência de testes de restore.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Funções de segurança e observabilidade com IO e testes.
```

## Sprint 13 (Dias 61–65) — QA final + UAT

```txt
Quero que executes o Sprint 13 no repo applandlord.

Objetivo:
- Fechar qualidade para apresentação e uso real inicial.

Tarefas:
1) Executar E2E dos 6 fluxos críticos.
2) Executar testes manuais de edge cases.
3) Corrigir bugs P0/P1.
4) Criar script de seed para demo.
5) Fechar checklist de release.

Entregáveis obrigatórios:
- Relatório de QA/UAT.
- Lista de bugs corrigidos e pendências.
- Evidência de execução dos testes.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- O que foi testado, entrada, saída esperada e resultado real.
```

## Sprint 14 (Dias 66–70) — Demo final + go-live controlado

```txt
Quero que executes o Sprint 14 no repo applandlord.

Objetivo:
- Preparar demo comercial e operação inicial controlada.

Tarefas:
1) Criar script de demo de 10 minutos.
2) Preparar dados fictícios de impacto.
3) Validar modo demo estável.
4) Criar materiais de apresentação (dor -> solução -> valor).
5) Definir plano pós-demo (30 dias).

Entregáveis obrigatórios:
- Pacote de demo completo.
- Documento operacional pós-demo.
- Check final de riscos.
- Atualização do CHANGELOG e checklist temporal.

Obrigatório documentar tudo:
- Toda função e fluxo apresentado, com entrada, saída e como testar.
```
