# Sprint 8 — UX de foco e microcopy

Data: 2026-04-18

## Objetivo da sprint
Melhorar clareza, linguagem e redução de carga cognitiva no painel principal do senhorio com foco em:
1. 1 CTA principal por ecrã/seção;
2. microcopy em linguagem de senhorio;
3. empty states orientados à ação;
4. mensagens de erro/sucesso mais claras;
5. consistência visual para demo.

---

## Entregáveis obrigatórios desta sprint
- ✅ Guia de microcopy v1: `docs/MICROCOPY_GUIDE_V1.md`.
- ✅ Lista de alterações UX com racional (secção "Lista de alterações UX").
- ✅ Testes manuais guiados de usabilidade (secção "Como testar manualmente").
- ✅ Atualização do `CHANGELOG.md` e `TEMPORAL_CHECKLIST.md`.

---

## Lista de alterações UX com racional

1. **Hero com apenas 1 CTA principal**
   - Alteração: botão primário mantido para início do fluxo (`Começar cadastro base`); ação secundária convertida para link textual.
   - Racional: reduz competição visual e melhora hierarquia de decisão.

2. **Revisão de linguagem para contexto de senhorio**
   - Alteração: termos ajustados para operação imobiliária (`base do portfólio`, `cobranças`, `pedido de manutenção`, `resumo do senhorio`).
   - Racional: aproxima a interface da linguagem de trabalho do utilizador-alvo.

3. **Empty states orientados à ação em todas as listas**
   - Alteração: `RecordList` evoluído para título + contexto + CTA com âncora.
   - Racional: elimina estados vazios passivos e acelera próxima ação.

4. **Mensagens de erro/sucesso mais úteis**
   - Alteração: tratamento de erro normalizado com fallback legível (`apiErrorMessage`), mensagens com instrução implícita e foco em recuperação.
   - Racional: reduz ambiguidade e suporte reativo.

5. **Consistência visual de links de apoio**
   - Alteração: criação da classe `.inline-link` e padronização visual de parágrafos em blocos `empty`.
   - Racional: mantém o CTA principal dominante e harmoniza demo.

---

## Componentes alterados (entradas, saídas e estados visuais)

## `app/page.tsx`

### Componente `Home`
- **Objetivo:** orquestrar o painel principal com dados operacionais/financeiros e fluxos de criação.
- **Entradas:** sem props (estado interno alimentado por APIs).
- **Saídas:** renderização de seções (`hero`, `base do portfólio`, `contratos`, `financeiro`, `operação`) com CTA principal por bloco.
- **Estados visuais principais:**
  - `loading`: labels de sincronização e texto de rodapé "A atualizar dados do senhorio...".
  - `notice-success`: feedback positivo pós-submissão.
  - `notice-error`: feedback de erro com texto de recuperação.
  - listas vazias com card `empty` + link de ação.

### Função `apiErrorMessage(data, fallback)`
- **Objetivo:** normalizar mensagem de erro retornada por APIs para microcopy legível.
- **Entrada:**
  - `data: unknown` (payload bruto de resposta)
  - `fallback: string` (texto padrão quando payload não contém erro legível)
- **Validações:**
  - lê `data.error` se string;
  - lê `data.message` se string;
  - fallback caso contrário.
- **Saída:** `string`.
- **Exemplo:**
  - entrada: `{ error: "Unit already occupied" }`, fallback "Não foi possível concluir o pedido."
  - saída: `Unit already occupied`
- **Erros possíveis:** não lança exceção.
- **Efeitos colaterais:** nenhum.

### Função `RecordList({ items, empty, render })` (alterada)
- **Objetivo:** renderizar listas com fallback acionável em estado vazio.
- **Entrada:**
  - `items: Row[]`
  - `empty: { title: string; hint: string; actionLabel: string; actionHref: string }`
  - `render: (row) => ReactNode`
- **Validações:** estado vazio quando `items.length === 0`.
- **Saída:**
  - com itens: `div.stack` com cartões;
  - sem itens: cartão `empty` com título, dica e link.
- **Exemplo de empty:**
  ```json
  {
    "title": "Ainda não existem imóveis registados.",
    "hint": "Registe o primeiro imóvel para desbloquear unidades, contratos e cobranças.",
    "actionLabel": "Registar primeiro imóvel",
    "actionHref": "#property-name"
  }
  ```
- **Erros possíveis:** não lança exceção.
- **Efeitos colaterais:** nenhum.

### Função `postJson(endpoint, body, message)` (alterada)
- **Objetivo:** submeter formulários com feedback de sucesso e reload de dados.
- **Entrada:**
  - `endpoint: string`
  - `body: Record<string, unknown>`
  - `message: string`
- **Validações:** bloqueia submit concorrente quando `submitting` está preenchido.
- **Saída:** `Promise<void>`.
- **Erros possíveis e comportamento esperado:**
  - falha HTTP: lança `Error` com texto normalizado por `apiErrorMessage`;
  - UI exibe `notice-error` no `catch` do formulário chamador.
- **Efeitos colaterais:**
  - chamada externa HTTP `POST`;
  - recarrega estado via `load()`.

### Função `sendInvoiceViaWhatsApp(invoice)` (alterada)
- **Objetivo:** enviar cobrança por WhatsApp para o inquilino do contrato.
- **Entrada:** `invoice: Row` contendo `id` da cobrança e `lease.renter.id`.
- **Validações:** exige `invoiceId` e `tenantId` válidos.
- **Saída:** `Promise<void>` com `notice-success` em envio bem-sucedido.
- **Erros possíveis e comportamento esperado:**
  - IDs ausentes: `notice-error` com orientação explícita;
  - falha HTTP: `notice-error` com texto de fallback amigável.
- **Efeitos colaterais:**
  - chamada externa HTTP `POST /api/whatsapp/send-invoice`.

## `app/components/lease-wizard.tsx`

### Componente `LeaseWizard` (alterado)
- **Objetivo:** guiar criação de contrato em 5 passos com validação progressiva e linguagem focada em senhorio.
- **Entradas (props):**
  - `propertyOptions`, `unitOptions`, `renterOptions`: listas de opções;
  - `submitting`: estado de envio;
  - `onSubmit(endpoint, body, message)`;
  - `setNotice`.
- **Saída:** JSX com passos 1–5, confirmação e sucesso.
- **Estados visuais:**
  - passo atual (`Passo X de 5 · Um foco por vez`);
  - erro por validação (`notice-error` externo);
  - sucesso final com recomendação de próximo passo.

### Função `validateStep(currentStep)` (mensagens alteradas)
- **Objetivo:** validar campos obrigatórios por passo antes de avançar.
- **Entradas:** `currentStep: 1|2|3|4|5`.
- **Validações:** imóvel/unidade, inquilino, datas, renda, `dueDay` entre 1 e 28.
- **Saída:** `boolean`.
- **Erros possíveis:** não lança; usa `setNotice` com mensagens orientadas à correção.
- **Efeitos colaterais:** altera mensagem visual no ecrã.

### Função `createLease()` (mensagem alterada)
- **Objetivo:** persistir contrato e avançar para passo de sucesso.
- **Entrada:** estado interno `form`.
- **Saída:** `Promise<void>`.
- **Erros possíveis:** falhas de validação/API exibidas em `setNotice`.
- **Efeitos colaterais:** chamada HTTP via `onSubmit('/api/leases', ...)`.

## `app/globals.css`

### Classe `.inline-link` (nova)
- **Objetivo:** diferenciar CTA secundário sem competir com botão primário.
- **Entrada:** aplicação em elementos `<a>`.
- **Saída visual:** link sublinhado com cor de destaque sem bloco sólido.
- **Estados visuais:** padrão e hover herdado.

### Regra `.empty p` (nova)
- **Objetivo:** padronizar espaçamento de dicas nos empty states.
- **Saída visual:** margem consistente para leitura rápida.

---

## Endpoints/API criadas ou alteradas

Nesta sprint (8), **nenhum endpoint foi criado ou alterado**.

### Contratos de entrada/saída
- Mantidos sem alteração estrutural.

### Autenticação/autorização
- Mantida sem alteração.

### Casos de erro e mensagens
- Sem alteração de contrato backend; melhoria aplicada no frontend ao interpretar mensagens de erro.

---

## Mudanças de dados

### Schema afetado
- Nenhum.

### Migração aplicada
- Nenhuma migração nova.

### Impacto em dados existentes
- Nenhum impacto estrutural ou semântico em dados persistidos.

### Plano de rollback
- Reverter alterações dos arquivos de UI/documentação da sprint (`app/page.tsx`, `app/components/lease-wizard.tsx`, `app/globals.css`, `docs/MICROCOPY_GUIDE_V1.md`, `docs/SPRINT8_UX_MICROCOPY.md`, `CHANGELOG.md`, `TEMPORAL_CHECKLIST.md`, `README.md`).

---

## Como testar manualmente (passo a passo)

1. Executar `npm run dev`.
2. Abrir `/login` e autenticar.
3. Aceder `/` e confirmar no hero:
   - apenas 1 botão primário;
   - link secundário textual.
4. Em cada seção (Base, Contratos, Cobrança, Operação), validar:
   - 1 CTA principal (botão primário);
   - copy orientada a senhorio.
5. Limpar dados (ou usar ambiente novo) e validar empty states:
   - presença de título + contexto + link de ação.
6. Submeter formulários com erro intencional (ex.: contrato sem dados obrigatórios) e validar mensagens de recuperação.
7. Criar contrato com wizard e confirmar mensagem de sucesso com próximo passo.
8. No financeiro, gerar cobranças e registar pagamento; validar feedback textual revisado.

---

## Testes automatizados executados
- `node --test tests/lease-wizard-validation.test.js`
- `node --test tests/dashboard-attention-model.test.js`

## Evidência de sucesso
- Suítes críticas do wizard e dashboard passam após alterações de microcopy/UI.
- Renderização mantém estrutura de blocos e adiciona orientação acionável em estados vazios.
- Hierarquia visual da demo reforçada com CTA principal único no hero.

---

## Documentação técnica relacionada atualizada
- `docs/MICROCOPY_GUIDE_V1.md`
- `docs/SPRINT8_UX_MICROCOPY.md`
- `CHANGELOG.md`
- `TEMPORAL_CHECKLIST.md`
- `README.md`
