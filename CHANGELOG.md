# Changelog

## 2026-07-02 (v0.16.0 — Lançar contas: lote de despesas + faixa financeira compacta)
- **Autor:** Vinicius + Claude
- **Tipo:** ux + feature (lançamento de despesas em massa)
- **Problema:** lançar as contas do mês (luz, água, condomínio…) era CRUD cru — um formulário por despesa, um imóvel de cada vez. E os 4 cartões de topo das Finanças ocupavam meia página só para dizer 4 números.
- **Descrição:**
  - **"Lançar contas" (lote):** botão verde no cabeçalho das Despesas abre um fluxo em 2 passos — (1) **grelha de tipos** com ícone próprio por categoria (Energia ⚡, Água 💧, Gás 🔥, IPTU 🧾, Seguro 🛡, Limpeza ✨, Manutenção 🔧, Condomínio 🏢, Outros ➕); (2) **lista corrida**: um apartamento por linha, só o valor à frente. Digitar → ✓ verde + destaque; total corrido no rodapé fixo; "Guardar N" lança tudo num só pedido.
  - **Memória do assistente:** botão "Preencher com o último valor" e valor-fantasma por linha ("usar R$ X"), a partir do último lançamento dessa categoria em cada imóvel.
  - **Faixa financeira compacta:** os 4 cartões de topo deram lugar a uma **faixa fina e fixa** (recebido · a receber · em atraso · despesas) — mesma mensagem, ⅓ do espaço; mostra **"✓ sem atrasos"** a verde quando está tudo em dia (linguagem de orientação, não só métrica).
  - **Backend:** `POST /api/expenses/batch` (`createMany` atómico, tudo-ou-nada) e `GET /api/expenses/last?category=` (último valor por imóvel).
- **Validação ao vivo:** E2E de HTTP + UI — grelha de 9 tipos, lista paginada 50/N, 3 valores → 3 ✓ + "R$ 827" + "Guardar 3", save → "3 contas lançadas de energia", **zero erros de página**; BD confirma os lançamentos nos imóveis certos.
- **Revisão adversarial (7 achados confirmados, corrigidos antes do envio):**
  - **Parsing financeiro estrito:** o endpoint deixou de usar `asNumber` (que corrompia "1.234" → R$1,23 e descartava "1.234,56" em silêncio); agora só aceita números canónicos e devolve **400** para valores mal formatados (nunca corrompidos nem perdidos sem aviso).
  - **Idempotência:** chave por lote (`idempotencyKey`) + **advisory lock** transacional + registo na auditoria — duplo-clique, retry de rede e **pedidos concorrentes** lançam o lote UMA vez (testado com 2 POSTs paralelos reais: um cria, o outro devolve `duplicate`, BD com um único lote).
  - **Sugestões por imóvel via `DISTINCT ON`** (Postgres): uma linha por imóvel na base de dados — sem a janela de 2.000 despesas que deixava imóveis de fora e sem trazer o histórico inteiro para memória.
  - **Cliente:** "Preencher com o último valor" passa a cobrir **todos** os imóveis (mesmo os ainda não paginados); confirmação ao voltar com valores por guardar; foco só na 1.ª página (deixa de saltar para o topo a cada "Ver mais"); cap do lote subido para 5.000.
- **Fica para P1 (assumido):** editar/apagar despesa em massa, valores diferenciados por período, importação de faturas.
- **Risco/rollback:** baixo (aditivo — 2 rotas novas + 1 componente novo; a faixa substitui as tiles na mesma secção). Sem alteração de schema. Rollback por reversão.

## 2026-07-02 (v0.15.0 — P0 de escala: paginação, agregados e mutações cirúrgicas)
- **Autor:** Vinicius + Claude
- **Tipo:** arquitetura/performance (fundação para carteiras grandes — auditoria "3.000 apartamentos")
- **Problema:** o carregamento inicial descarregava a base de dados inteira (9 coleções sem paginação, ~200–350 MB estimados a 3.000 apartamentos), cada clique recarregava tudo, e a home renderizava todos os cartões no DOM.
- **Descrição:**
  - **P0.1 Paginação por cursor em todos os GETs** (`invoices, payments, expenses, tickets, properties, units, renters, leases`) — resposta `{ items, nextCursor, total }`, `take` limitado, filtros no servidor (estado da cobrança, estado/urgência do ticket, `q` de pesquisa). Removidos includes mortos (ex.: renters trazia TODAS as faturas).
  - **P0.2 Endpoints agregados:** novo `GET /api/home` (tarefas top-5 + contagens + resumo do mês — **payload constante ~900 bytes**, com 2 ou 3.000 apartamentos) e novo `GET /api/apartments` (view-models prontos, paginados, pesquisa server-side por morada/nome/cidade/inquilino) + `GET /api/apartments/[unitId]` (detalhe com pagamentos/contas limitados). O cálculo O(n²) que vivia no browser passou para o servidor (4 queries por página).
  - **P0.3 Mutações cirúrgicas:** novo `POST /api/apartments/[unitId]/mark-paid` — **um pedido atómico** (garante fatura do período, reaproveita pagamento por confirmar, paga o valor em falta, confirma e atualiza a fatura, com auditoria). O cliente atualiza só o cartão afetado + agregado leve; **fim do reload global de 9 coleções por clique**.
  - **P0.4 Componente dividido:** home extraída para `home-page.tsx` (o monólito de ~1.700 linhas perdeu o painel), cartões com `React.memo`, helpers partilhados em `shared.tsx`. **DOM limitado**: 24 cartões por página + botão "Ver mais (X de Y)" em todas as listas (home, imóveis, inquilinos, contratos, cobranças, despesas, manutenção). Pesquisa da home com debounce e no servidor.
  - Restantes páginas re-ligadas a cargas por modo (só o que cada página precisa) e tiles de resumo alimentadas pelos agregados do dashboard (`overdueTotal`, `occupiedRent` adicionados).
- **Validação em volume:** gerados 82 apartamentos localmente — home abre com 24 cartões (12 KB), `/api/home` 894 bytes/0,15s, "Ver mais" 24→48 sem duplicados, mark-paid com 1 pedido a atualizar tarefa+agregado, pesquisa server-side. As 4 páginas restantes verificadas por screenshot sem erros. Typecheck 0, build OK.
- **Revisão adversarial (corrigido antes do envio):** o mark-paid ganhou **lock de linha (`FOR UPDATE`)** contra cliques concorrentes — testado com 2 pedidos paralelos reais: 1 pagamento criado, o outro devolve "já pago"; deixou de **fabricar um pagamento extra** quando já não há valor em falta; **reativa fatura cancelada** do período em vez de violar o unique (leaseId, period); `paidAt` alinhado com a rota de confirmação; erros internos deixam de vazar para o browser. No cliente: pesquisa com **número de sequência** (respostas fora de ordem descartadas), `React.memo` dos cartões efetivo (callbacks memoizados), toast honesto em pagamento parcial ("ainda falta receber parte"), fim do double-fetch no mount e removido um fetch morto de 100 faturas no billing. Paginação por cursor e agregados do /api/home verificados como corretos (empiricamente e por prova via unique constraint).
- **Fica para P1 (assumido):** combobox assíncrono nos selects (hoje limitados a 500 opções), ações em massa, import/export CSV, pesquisa/ordenação nas outras listas, relatórios, equipas.
- **Risco/rollback:** médio-alto (contratos de API de listagem mudaram de `[]` para `{items,...}` — o único consumidor é o cliente, atualizado em conjunto). Rollback por reversão. Sem alteração de schema.

## 2026-07-02 (v0.14.0 — Painel assistente: primeiro tarefas, depois números)
- **Autor:** Vinicius + Claude
- **Tipo:** ux (nova mentalidade — "assistente do senhorio")
- **Descrição:** o Painel deixa de responder "que informação tenho?" e passa a responder **"o que preciso de fazer?"**. Bloco **"O que fazer hoje"** no topo, com ações diretas:
  - **Aluguéis por receber** (valor em destaque, inquilino por baixo) + botão **"Marcar como pago"** ali mesmo.
  - **Pagamentos a confirmar** + botão "Confirmar".
  - **Contratos a terminar** (≤ 60 dias) — "termina em X dias", abre o apartamento.
  - **Avarias pendentes** — atalho para Manutenção.
  - Quando não há nada: **"Está tudo em dia — não há nada pendente hoje."** (linguagem de assistente, não métricas).
  - Os números ("Este mês", resumo) passam para **baixo** das ações.
- **Base do brief de UX** (primeiro trabalho, depois informação); próximas frentes: formulários em modal, cartões que contam histórias, navegação por processo.
- **Validação:** typecheck 0, build OK, screenshot ao vivo do Painel task-first.
- **Risco/rollback:** baixo (aditivo no topo do Painel; sem alterar API/schema).

## 2026-07-02 (v0.13.0 — Mercado brasileiro: Reais (R$) e contexto BR)
- **Autor:** Vinicius + Claude
- **Tipo:** i18n / l10n (mercado-alvo Brasil)
- **Descrição:**
  - **Moeda em Reais (R$):** `money()` passa a `pt-BR` / `BRL` — todos os valores da app mostram **R$** com separador de milhar brasileiro. Datas e períodos também em `pt-BR`.
  - **Rótulos e avisos:** "Renda mensal (€)" → **"Aluguel mensal (R$)"**, "Valor (€)" → "Valor (R$)", "Morada" → **"Endereço"**, "Código postal" → **"CEP"**. Ícone de moeda deixa de ser o € (passa a nota, neutro).
  - **Categorias e país:** IMI → **IPTU**, Eletricidade → Energia; país por omissão **Brasil**. Também nas mensagens de WhatsApp (BRL).
  - **Dados de demonstração brasileiros:** 2 apartamentos em São Paulo (Rua Oscar Freire) e Rio (Av. Atlântica), inquilinos com telefone +55 e CPF, aluguéis realistas (R$ 3.200 e R$ 4.100), condomínio/IPTU/seguro.
  - **Dev local:** o `seed-demo.js` passa a carregar o `.env` sozinho (para `node prisma/seed-demo.js` funcionar sem configurar nada).
- **Pendente (próximo pass dedicado):** localização completa do texto PT→BR ("renda"→"aluguel" em todas as frases, com concordância de género; evitar falsos positivos como "arrendamento") — não feito em massa para não partir a gramática.
- **Validação:** typecheck 0, build OK, screenshot ao vivo da home a mostrar R$ e dados BR.

## 2026-07-01 (v0.12.0 — Auditoria de design: sistema de tokens, ritmo e consistência)
- **Autor:** Vinicius + Claude
- **Tipo:** ui/ux (sistema de design / polish)
- **Escopo:** auditoria página a página (Painel, Imóveis, Finanças, Manutenção, Contratos) e harmonização.
- **Medição (antes):** o CSS tinha *design drift* — **18 raios distintos**, **~25 tamanhos de fonte**, **~30 combinações de padding** e **~15 sombras**.
- **Organização (depois):**
  - **Tokens de design** no `:root`: escala de raios (`--r-sm/md/lg/pill`) e sombras (`--shadow-card`, `--shadow-card-hover`).
  - **Sombras de card unificadas** — várias variantes passam a um único token (profundidade consistente em todos os cartões e tiles das várias páginas).
  - **Raios normalizados** para uma escala de 2px (18 → 7 valores: 10/12/14/16/18 + pílula + círculo), sem alterar visualmente os cartões principais.
  - **Tiles das Finanças alinhadas** — rótulos numa só linha (Recebido / Por receber / Em atraso / Despesas), números alinhados, mesma sombra das tiles de Imóveis.
- **Nota:** também foi corrigido, no ambiente de dev, um erro de cache do `.next` (chunk em falta) que fazia algumas páginas renderizar sem CSS durante os testes — não afeta produção (o build compila limpo).
- **Validação:** typecheck 0, build OK, **screenshots ao vivo dos 5 ecrãs** para confirmar consistência e ausência de regressões.
- **Risco/rollback:** baixo (tokens + normalização de valores CSS). Sem alteração de API/schema. Fica por afinar (opcional) a escala tipográfica e os paddings.

## 2026-07-01 (v0.11.0 — Cards com cor e vida; morada = identificador; Imóveis visual)
- **Autor:** Vinicius + Claude
- **Tipo:** ui/ux (redesenho)
- **Escopo:** ronda de design — home e página Imóveis; identificador do apartamento.
- **Descrição:**
  - **Identificador = morada.** O apartamento passa a ser identificado pela **morada (Rua + nº)**; o "nome" é um **título opcional** (rótulo). No formulário, morada é obrigatória e o nome é opcional; se o nome for vazio, guarda-se a morada. O endpoint atómico `/api/apartments` reflete isto (POST e PATCH) e continua a **preservar a região**.
  - **Cards com cor e vida (home).** Estado passa a **pill sólido vívido** (Pago verde, Por pagar laranja, A confirmar azul, Vago cinza), avatar do inquilino com cor forte, rótulo opcional em destaque, morada como título e factos com ícones (💶 renda, 📅 fim do contrato, 🔧 avarias). Fundo branco, sem pastéis.
  - **Página Imóveis, mais visual e menos texto.** Resumo em tiles com ícones (imóveis / ocupadas / livres / renda). Cada imóvel mostra a **ocupação como barra visual** (uma marca por unidade: verde ocupada, cinza livre, laranja manutenção) e contagens por ícone (🏢 ✓ 🔑 💶); editar passa a ser um botão de **lápis**. Removidas as linhas de texto por unidade.
  - **Menos texto, mais design** em geral, com etiquetas por ícone onde o texto era dispensável.
- **Validação:** typecheck 0, build de produção OK, verificação visual com a app a correr (screenshots da home e de Imóveis) e revisão adversarial de correção.
- **Risco/rollback:** médio (lógica de identificador + redesenho de 2 ecrãs). Rollback por reversão. Sem alteração de schema.

## 2026-07-01 (v0.10.1 — Credenciais da conta de demonstração)
- **Autor:** Vinicius + Claude
- **Tipo:** chore
- **Descrição:** conta de demonstração passa a **`adilson@teste.com` / `password123!`** (antes `demo@applandlord.local`). Atualizado o endpoint protegido `/api/demo/seed`, a deteção da conta demo na interface e o seed local (que passa a definir a password real). Em produção: entrar com estas credenciais cria a conta (o formulário aceita-as) e o botão "Carregar dados de demonstração" popula os 2 apartamentos.

## 2026-07-01 (v0.10.0 — Finanças e restantes páginas redesenhadas + botão "carregar demo")
- **Autor:** Vinicius + Claude
- **Tipo:** ui/ux + feat
- **Descrição:**
  - **Finanças redesenhadas** (eram densas e feias): cartões de resumo com ícones (recebido/por receber/em atraso/despesas), botão claro para gerar cobranças do mês, e listas limpas (avatares, estado colorido, sem pastel) de **cobranças**, **pagamentos por confirmar** e **despesas**. Removido o formulário redundante de registar pagamento (a home já marca como pago num toque).
  - **Manutenção redesenhada:** pedidos em cartões limpos com ícone, estado colorido e ações; o formulário deixa de pedir "unidade" ("Qual apartamento?").
  - **Contratos redesenhados:** lista de contratos ativos com avatar, renda e "Terminar"; o **assistente de contrato deixa de mostrar "Unidade"** (a unidade do apartamento é escolhida automaticamente; só aparece se um imóvel tiver mais que uma).
  - **Botão "Carregar dados de demonstração"** (endpoint protegido `/api/demo/seed`, só para a conta `demo@applandlord.local`): com 1 clique carrega 2 apartamentos, 2 inquilinos e histórico — para mostrar a app em produção sem tocar em dados reais.
- **Validação:** typecheck 0, build de produção OK, e verificação ao vivo (screenshots de Finanças/Manutenção/Contratos + teste E2E do botão demo: conta vazia → clicar → 2 apartamentos).
- **A fazer a seguir:** repensar a página **Imóveis** (agora que adicionar/editar acontece na home, o seu papel muda).

## 2026-07-01 (v0.9.0 — Home mais visual (ícones, avatares, "Este mês") + dados demo)
- **Autor:** Vinicius + Claude
- **Tipo:** ui/ux + dados
- **Descrição:**
  - **"Este mês" redesenhado:** montante recebido em destaque, **barra de progresso** até ao previsto, e chips com ícones (✓ pagos / 🕐 por pagar).
  - **Mini-barra iconificada:** apartamentos / em atraso / avarias passam a **ícone + número** (sem etiqueta de texto), com `aria-label` para leitores de ecrã.
  - **Cards com mais intenção:** **avatar do inquilino** (iniciais, cor forte) ou ícone de chave quando vago; factos com **ícones** em vez de texto (💶 renda · 📅 fim do contrato · 🔧 avarias).
  - **Pesquisa** sempre visível com ícone de lupa.
  - Conjunto de ícones alargado (carteira, relógio, calendário, utilizador, telefone, euro, alerta, chave…).
  - **Regra nova de design:** preferir ícones a texto sempre que o ícone seja claro.
  - **Dados demo** (`prisma/seed-demo.js`): **2 apartamentos, 2 inquilinos, contratos desde 2023 (~3 anos)**, com histórico de rendas pagas, uma renda por pagar este mês, despesas e uma avaria. Login: `demo@applandlord.local` (password definida no primeiro acesso).
- **Validação:** typecheck 0, verificação visual com a app a correr.
- **A fazer a seguir:** aplicar a mesma linguagem visual às Finanças e restantes páginas.

## 2026-07-01 (v0.8.0 — Redesenho dos cards: branco, com intenção)
- **Autor:** Vinicius + Claude
- **Tipo:** ui/ux (redesenho visual da página inicial)
- **Escopo:** feedback de design sobre a casa centrada no apartamento.
- **Descrição:**
  - **Cards redesenhados** com intenção: fundo **branco**, sem a listra colorida ao canto. Ícone com contorno limpo à esquerda; **o estado é a âncora à direita** (✓ Pago / ● Por pagar / ● Vago), com cor só no texto e na marca. Menos texto (a morada sai do card; inquilino e renda numa linha; rodapé discreto só com contrato/avarias).
  - **Sem cores pastel:** removidos os fundos pastel dos selos, do ícone, da banda "Este mês" do detalhe e do botão "Ligar" — passa tudo a branco com cor apenas no texto/contorno.
  - **Pesquisa sempre visível**, logo a seguir à mini-barra de resumo (no meio), agora com ícone de lupa.
- **Validação:** typecheck 0, build de produção OK, e verificação visual com a app a correr (screenshots da home e do detalhe).
- **Risco/rollback:** baixo (CSS + markup do card). Rollback por reversão. Sem alteração de API/schema.

## 2026-07-01 (v0.7.0 — Um imóvel = um apartamento; contas, resumo e pesquisa)
- **Autor:** Vinicius + Claude
- **Tipo:** feat/ux + fix
- **Escopo:** segunda ronda de feedback sobre a casa centrada no apartamento.
- **Descrição:**
  - **Fim do conceito de "unidade" na interface:** adicionar/editar um apartamento é um só passo (nome, morada, cidade, código postal, renda). Por trás, imóvel + unidade são criados/atualizados **atomicamente** por um novo endpoint `/api/apartments` (transação) — nunca deixa um imóvel órfão nem uma escrita parcial.
  - **Cards mais completos:** mostram o estado do mês, **"Contrato até <data>"** e **"N avarias"** (tickets abertos), com o nome do inquilino e a renda.
  - **Mini-barra de resumo:** nº de apartamentos, rendas em atraso e avarias abertas.
  - **Pesquisa** de apartamentos (por nome, morada ou inquilino) — aparece quando há 4+.
  - **Contas e despesas dentro de cada imóvel:** lista + adicionar (tipo de conta, valor, data, descrição) + apagar, ligadas à API de despesas por imóvel.
  - **Detalhe do apartamento** reúne inquilino + contrato (datas, renda, avarias abertas), últimos pagamentos, contas e ações (editar/avaria).
- **Correções (algumas encontradas por teste ao vivo + revisão adversarial):**
  - "Recebido X de Y" passa a somar os **pagamentos confirmados reais** do mês (antes usava a renda nominal e podia mostrar valores de outros meses, ex.: "1900 € de 950 €").
  - Datas formatadas em **UTC** (deixam de aparecer trocadas por um dia).
  - Avarias atribuídas à **unidade certa** (deixaram de aparecer em unidades vizinhas do mesmo prédio).
  - **Editar já não sobrescreve a região** do imóvel com a cidade; o **nome da unidade** é sincronizado com o do imóvel.
  - **Gestão de foco** ao entrar/sair dos formulários de adicionar/editar (teclado e leitor de ecrã não perdem o sítio).
  - a11y: alvo de toque do "Apagar" ≥ 44px; mini-barra anunciada como unidades rotuladas (com estado); pesquisa com região viva do nº de resultados; contraste do placeholder; título do estado vazio como cabeçalho; reconciliação do apartamento aberto se deixar de existir.
- **Validação:** typecheck 0 erros, build de produção OK, e **teste ponta-a-ponta em browser real** (adicionar → editar → conta → marcar como pago) com verificação na base de dados (transação atómica, região preservada, sem faturas/pagamentos duplicados). Revisão adversarial de 3 dimensões (19 agentes); 14 achados confirmados corrigidos.
- **Risco/rollback:** risco médio (novo endpoint + reescrita do painel). Rollback por reversão. Novo ficheiro `app/api/apartments/route.ts` (sem alteração de schema).

## 2026-07-01 (v0.6.0 — Casa centrada no apartamento (radicalmente mais simples))
- **Autor:** Vinicius + Claude
- **Tipo:** feat/ux (redesenho da página inicial)
- **Escopo:** repensar a página inicial à volta do que uma senhora de 70 anos entende — "os meus apartamentos" — em vez de conceitos de gestão (portfólio, ocupação, saldo líquido, KPIs).
- **Descrição:**
  - **Nova casa (`/dashboard`)** deixa de ser um painel de gestão e passa a ser a lista dos apartamentos:
    - Banda **"Este mês"**: quantos já pagaram, quantos faltam, quantos a confirmar, e recebido vs esperado em euros.
    - **Cartões grandes** por apartamento (morada · inquilino · renda · estado do mês), ordenados com "falta pagar" no topo. Botão **"Marcar como pago"** de um só toque.
    - **"Marcar como pago"** garante a cobrança do mês, regista o pagamento **em falta** (não o total) e confirma-o — para o "Recebido este mês" ficar correto.
    - Toque no cartão → **detalhe do apartamento**: inquilino + telefone (ligar), renda, datas do contrato, últimos pagamentos e atalhos para editar/avarias.
  - Removido da casa o jargão de gestão (anel de ocupação %, saldo líquido, grelha de KPIs, alertas). Os separadores Finanças/Contratos/Manutenção continuam a funcionar para uso avançado.
  - **Acessibilidade:** gestão de foco ao abrir/voltar (teclado e leitor de ecrã não perdem o sítio), `aria-busy` no botão a processar, alvos de toque ≥ 48px, contraste corrigido (botão a processar, seta do cartão, textos secundários), título longo do imóvel deixa de transbordar.
  - A fatura do mês é lida da lista completa de faturas (não das 12 do contrato) para evitar faturas/pagamentos duplicados.
- **Revisão:** dois revisores adversariais (lógica de pagamento + acessibilidade/responsivo). Corrigidos: duplo-pagamento em nova tentativa (leitura de pagamentos frescos), sobre-cobrança em pagamento parcial (paga só o que falta), risco de fatura duplicada, perda de foco na navegação, contraste do botão desativado (2.0:1→5.5:1), seta do cartão e alvo do botão "voltar".
- **Impacto no roadmap:** primeira grande simplificação para o perfil sénior; próximos passos possíveis — simplificar o onboarding/adicionar apartamento e dobrar as ações avançadas dentro do apartamento.
- **Risco/rollback:** risco médio (redesenho da página inicial + orquestração de pagamento no cliente). Rollback por reversão dos ficheiros. **Nota honesta:** validado por tipos + duas revisões de código; ainda **sem verificação visual/funcional com a app a correr**.

## 2026-07-01 (v0.5.0 — Uplift visual aproximando dos mockups)
- **Autor:** Vinicius + Claude
- **Tipo:** feat/ux/ui
- **Escopo:** melhorias visuais em toda a app a aproximar dos mockups de design, sem alterar regras de negócio
- **Descrição:**
  - **Tiles de estatística:** os resumos de Imóveis (imóveis/unidades/ocupadas/vagas/manutenção) e Finanças (em atraso/por receber/recebidas/total em atraso) passam de chips a cartões-número legíveis.
  - **Indicador de passos do wizard:** o contrato passa a mostrar 1→5 com círculos numalados, linha de progresso e estados (ativo/concluído), em vez de "Passo X de 5". Com `role="group"`, `aria-current` e texto para leitor de ecrã.
  - **Controlo segmentado:** a urgência da manutenção passa de dropdown a botões segmentados (radiogroup acessível).
  - **Login:** marca "Applandlord" + tagline em destaque, cartão "Entrar na sua conta", botão **mostrar/ocultar palavra-passe** e linha de versão.
  - **Barra lateral:** botão **"Sair"** fixo no rodapé (desktop), sempre acessível.
  - Revisto por revisão adversarial; corrigidos o contraste do número dos passos pendentes e a exposição do progresso do wizard a leitores de ecrã.
- **Impacto no roadmap:** aproxima a UI do design pretendido; base para a Fase B de acessibilidade. Sem mudança de schema/API.
- **Risco/rollback:** risco baixo (CSS + markup aditivos). Rollback por reversão dos ficheiros. Nota: validado por tipos + revisão de código, ainda sem verificação visual na app a correr.

## 2026-07-01 (v0.4.0 — Gestão do dia-a-dia: editar, terminar, confirmar, despesas)
- **Autor:** Vinicius + Claude
- **Tipo:** feat/ux
- **Escopo:** fecha as lacunas de gestão identificadas na auditoria de fricção — a app deixa de ser só um funil de entrada de dados e passa a permitir manter o que já existe
- **Descrição:**
  - **Confirmar pagamento:** botão "Confirmar pagamento" na lista de pagamentos (liga a `POST /api/payments/[id]/confirm`, que já existia mas estava órfã); os pagamentos deixam de ficar eternamente "a aguardar" e passam a entrar no resumo financeiro. Mostra o estado (Confirmado / A aguardar confirmação).
  - **Terminar contrato:** botão "Terminar contrato" nos contratos ativos (liga a `PATCH /api/leases`), que encerra o contrato e liberta a unidade.
  - **Editar imóvel/unidade/inquilino:** adicionados `PATCH` a `/api/properties`, `/api/units`, `/api/renters` (não existiam) + `EditEntityForm` reutilizável e botões "Editar" nos cartões de imóvel, linhas de unidade e numa nova lista de inquilinos na aba "Imóveis".
  - **Despesas:** UI de despesas (registar por categoria/imóvel/data + lista com apagar), ligada ao CRUD `/api/expenses` que já existia sem interface; o lucro líquido passa a poder refletir custos reais.
  - **Rendas em atraso:** na aba "Finanças", resumo destacado (N em atraso · total €), filtro (todas / só em atraso / por receber) e data de vencimento por cobrança.
  - **Navegação:** o separador de contratos deixa de se chamar "Mais" («…») no telemóvel e passa a "Contratos" com ícone próprio, revelando uma ação central antes escondida.
- **Impacto no roadmap:** cobre criar + manter (editar/terminar/confirmar/apagar) das entidades centrais; sem mudança de schema.
- **Risco/rollback:** risco baixo-médio (novos handlers PATCH com scoping por owner; UI aditiva). Rollback por reversão dos ficheiros alterados.

## 2026-07-01 (v0.3.0 — Vista de gestão do portfólio na aba "Imóveis")
- **Autor:** Vinicius + Claude
- **Tipo:** feat/ux
- **Escopo:** a aba "Imóveis" (`/portfolio`) deixa de ser apenas um assistente de configuração e passa a mostrar a carteira real quando a conta já está configurada
- **Descrição:** enquanto o portfólio não está completo, mantém-se o funil guiado de onboarding; quando existem imóvel + unidade + inquilino (`setupComplete`), a página passa a mostrar uma vista de gestão — resumo (imóveis, unidades, ocupadas, vagas, em manutenção) e um cartão por imóvel (`PropertyCard`) com as suas unidades, renda, estado e inquilino ocupante (via contrato ativo). Ação principal "Adicionar imóvel" e "Adicionar unidade"/"Voltar aos imóveis" secundárias; os formulários de criação (imóvel/unidade/inquilino) são reutilizados. Revisto por revisão adversarial multi-agente; corrigidos contraste dos chips (escurecidos `chip-positive`/`chip-warning` para cumprir WCAG AA sobre o fundo da página) e o bucket de unidades em manutenção (para os totais baterem certo).
- **Impacto no roadmap:** resolve a lacuna de o senhorio nunca ver a sua lista de imóveis; alinha com "Reconhecimento > memória" da constituição. Sem mudança de schema nem de API.
- **Risco/rollback:** risco baixo (mudança de UI/CSS); rollback por reversão dos ficheiros alterados.

## 2026-07-01 (v0.2.0 — Acessibilidade Fase A + indicador de versão)
- **Autor:** Vinicius + Claude
- **Tipo:** feat/a11y
- **Escopo:** melhorias de acessibilidade e usabilidade (foco no público sénior/não técnico) e indicador de versão visível na interface
- **Descrição:** adicionado foco visível por teclado (`:focus-visible`) global em links, botões e campos, com contorno claro sobre a barra lateral escura (`app/globals.css`); notificações passam a ser anunciadas por leitores de ecrã com `role="alert"`/`aria-live="assertive"` (erros) e `role="status"`/`aria-live="polite"` (sucessos) em `app/components/control-center-page.tsx` e `app/login/page.tsx`; todos os campos do wizard de contrato passaram a ter `label`+`htmlFor`/`id` associados (`app/components/lease-wizard.tsx`); adicionado link "Saltar para o conteúdo" no layout do workspace e `<h1>` único por página; adicionados atributos `autocomplete`/`inputmode` a login, inquilino e imóvel; traduzido texto solto em inglês (`Active/Planned/Ended`, "Login", "Password"); adicionado indicador de versão em build-time via `next.config.mjs` (`NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_GIT_SHA`, `NEXT_PUBLIC_GIT_DATE`, `NEXT_PUBLIC_BUILD_TIME`) exposto por `lib/version.ts` e apresentado no rodapé do painel; versão de `package.json` elevada para `0.2.0`.
- **Impacto no roadmap:** melhora conformidade de acessibilidade (WCAG) e rastreabilidade de releases; não altera schema nem regras de negócio.
- **Risco/rollback:** risco baixo (mudanças aditivas de UI/CSS e configuração de build); rollback por reversão dos ficheiros alterados e do `next.config.mjs`.

## 2026-04-18 (Sprint 14 — Demo final + go-live controlado)
- **Autor:** Codex
- **Tipo:** feat/docs/test
- **Escopo:** pacote de demo comercial, dados fictícios de impacto, validação de estabilidade demo mode, materiais de apresentação e plano operacional de 30 dias
- **Descrição:** criado pacote de demo com roteiro de 10 minutos (`docs/demo/DEMO_SCRIPT_10_MIN.md`), base de impacto fictícia reutilizável (`docs/demo/DEMO_IMPACT_DATA.json`) e materiais comerciais de narrativa dor->solução->valor (`docs/demo/DEMO_PRESENTATION_MATERIALS.md`); implementada validação automatizada de estabilidade do modo demo em `tests/demo-mode-stability.test.js` cobrindo modelo de dashboard, fluxo de contrato, transições de cobrança e idempotência inbound; criado documento de operação pós-demo para 30 dias (`docs/SPRINT14_POST_DEMO_OPERATION.md`) e check final de riscos (`docs/SPRINT14_RISK_CHECK_FINAL.md`); consolidada documentação técnica da sprint em `docs/SPRINT14_DEMO_GO_LIVE.md`; adicionado comando `npm run demo:validate`; atualizado checklist temporal da Semana 14 com todos os itens concluídos.
- **Impacto no roadmap:** conclui integralmente a Semana 14 (Dias 66–70), fechando o ciclo de 70 dias com prontidão para demo comercial e go-live controlado.
- **Risco/rollback:** risco baixo/moderado (mudanças focadas em documentação e testes de validação); rollback por reversão dos arquivos da sprint.

## 2026-04-18 (Sprint 13 — QA final + UAT)
- **Autor:** Codex
- **Tipo:** fix/test/docs
- **Escopo:** estabilização final para apresentação, execução de fluxos críticos E2E, seed de demo e checklist de release
- **Descrição:** corrigido bug P0 de JSX inválido na secção de operação do dashboard (`app/page.tsx`), eliminando erro de parser que quebrava o build; criada suíte E2E dos 6 fluxos críticos (`tests/e2e-critical-flows.test.js`); adicionado script de seed de demo consistente (`prisma/seed-demo.js`) e comando `npm run db:seed:demo`; criado relatório formal de QA/UAT com evidência de testes, edge cases, bugs corrigidos e pendências (`docs/SPRINT13_QA_UAT.md`); atualizado checklist temporal da Semana 13 com itens concluídos.
- **Impacto no roadmap:** fecha entregáveis obrigatórios da Sprint 13 e prepara Sprint 14 (demo final + go-live controlado).
- **Risco/rollback:** risco baixo/moderado (ajuste de UI e novos artefactos de teste/documentação); rollback por reversão dos arquivos alterados nesta sprint.
## 2026-04-18 (Sprint 12 — segurança e estabilidade)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** hardening de validações backend, rate limiting, logs estruturados, drill de backup/restore e revisão de segredos/permissões
- **Descrição:** adicionados utilitários de segurança (`lib/security.ts`) com `ValidationError`, validação forte de email/senha/data e verificação de secrets obrigatórios; implementado rate limiting em memória (`lib/rate-limit.ts`) aplicado em `POST /api/auth/login`, `POST /api/whatsapp/webhook` e `POST /api/jobs/reminders/daily`; criada camada de observabilidade (`lib/observability.ts`) com logs JSON estruturados e redaction de campos sensíveis; rotas críticas atualizadas para respostas padronizadas (400/401/429/500) e `Retry-After`; criado script operacional `scripts/backup-restore-drill.sh` com evidência de restore em `docs/evidence/SPRINT12_RESTORE_EVIDENCE.md`; criada documentação técnica completa em `docs/SPRINT12_HARDENING_REPORT.md` e checklist `docs/SPRINT12_SECURITY_CHECKLIST.md`; atualizado `.env.example`, `TEMPORAL_CHECKLIST.md` (Semana 12 concluída) e `README.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 12 (Dias 56–60), fortalecendo base operacional para QA final e go-live controlado (Semanas 13–14).
- **Risco/rollback:** risco baixo/moderado (sem mudança de schema); rollback por reversão dos arquivos da sprint e desativação dos novos limites/configurações.

## 2026-04-18
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** governança, planejamento e visão de produto
- **Descrição:** adicionados `PRODUCT_CONSTITUTION.md`, `TEMPORAL_CHECKLIST.md` e `CHANGE_GOVERNANCE.md`.
- **Impacto no roadmap:** documentação base para todas as semanas (1–14).
- **Risco/rollback:** sem risco técnico; rollback simples removendo os arquivos.

## 2026-04-18 (atualização 2)
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** prompts de sprint e governança de documentação
- **Descrição:** adicionado `CODEX_SPRINT_PROMPTS.md` com prompts individuais para os 14 sprints; reforçadas regras obrigatórias de documentação de funções, entradas/saídas e testes em `CHANGE_GOVERNANCE.md`; atualizado `TEMPORAL_CHECKLIST.md` e `README.md`.
- **Impacto no roadmap:** melhora execução e rastreabilidade de todas as semanas (1–14).
- **Risco/rollback:** sem risco técnico; rollback removendo/ajustando os documentos.


## 2026-04-18 (Sprint 1 — arquitetura técnica)
- **Autor:** Codex
- **Tipo:** docs
- **Escopo:** arquitetura v1, contratos de API, convenção de estados, estratégia de migração e critérios de aceite
- **Descrição:** criado `docs/ARQUITETURA_V1_SPRINT1.md` com backlog MVP vs Fase 2, tabela de contratos das APIs principais, convenção de estados (`lease`, `rent/invoice`, `payment`, `ticket`, `reminder`), estratégia de migrations sem downtime (expand/backfill/contract), critérios de aceite por módulo, plano de testes manuais e evidência de testes automatizados; atualizado `TEMPORAL_CHECKLIST.md` marcando conclusão da Semana 1 e `README.md` com referência da documentação técnica.
- **Impacto no roadmap:** fecha oficialmente os entregáveis da Sprint 1 e reduz retrabalho para as sprints de implementação.
- **Risco/rollback:** sem risco de runtime (mudança documental); rollback simples revertendo os arquivos de documentação.

## 2026-04-18 (Sprint 2 — auth + tenancy base)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** autenticação, sessão, isolamento por owner, migração de dados e documentação técnica
- **Descrição:** implementado fluxo funcional de login/logout (`/api/auth/login`, `/api/auth/logout`, `/api/auth/session`, página `/login` e `middleware.ts`); adicionada camada de sessão assinada em `lib/auth.ts`; introduzido `ownerId` em todas as entidades core com novo model `User`; atualizadas APIs core para exigir sessão e filtrar leitura/escrita por `ownerId`; aplicada migração `prisma/migrations/20260418170000_sprint2_auth_tenancy/migration.sql` com backfill de dados existentes para owner bootstrap; atualizado fluxo WhatsApp para respeitar owner em envio/listagens.
- **Impacto no roadmap:** conclui integralmente a Semana 2 (auth + tenancy base), preparando Sprint 3 para reforço de modelo de dados e constraints.
- **Risco/rollback:** risco moderado em migração de dados (novas FKs e `NOT NULL`); rollback exige remover FKs/índices/colunas `ownerId` e restaurar snapshot pré-migração.

## 2026-04-18 (Sprint 3 — modelo SaaS robusto)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** evolução de schema financeiro/comunicação, constraint de contrato ativo único e trilha de auditoria
- **Descrição:** adicionadas tabelas `Expense`, `Reminder`, `WhatsAppMessage` e `AuditLog`; tabela física de cobranças renomeada de `Invoice` para `rent_charges` com compatibilidade mantida via Prisma `@@map`; criada constraint de 1 contrato ativo por unidade+owner (`Lease_one_active_per_unit_owner_key`); criados índices essenciais de desempenho por owner/status/datas; atualizado backend para registrar eventos críticos em auditoria (`LEASE_CREATED`, `LEASE_UPDATED`, `RENT_CHARGE_CREATED`, `PAYMENT_REGISTERED`); criada documentação técnica `docs/SPRINT3_SAAS_SCHEMA.md` com ER simplificado, matriz de entradas/saídas por tabela, contratos de API alteradas, plano de testes e rollback.
- **Impacto no roadmap:** conclui integralmente a Semana 3, preparando base de dados para fluxos de reminders, WhatsApp outbound/inbound e controles de compliance.
- **Risco/rollback:** risco moderado por DDL estrutural (rename de tabela + novos FKs/índices); rollback estruturado disponível em `prisma/migrations/20260418190000_sprint3_saas_schema/rollback.sql`.

## 2026-04-18 (Sprint 4 — wizard de contratos)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** fluxo guiado de contrato, validações de consistência, criação/seleção de inquilino e documentação técnica
- **Descrição:** implementado wizard em 5 passos no frontend (`app/components/lease-wizard.tsx`) com estados/transições, validações por etapa, tela de confirmação e tela de sucesso; endpoint `POST /api/leases` evoluído para suportar `renterMode` (`existing`/`new`) com criação de inquilino em linha; adicionadas validações de domínio em `lib/lease-wizard.ts` para datas, `dueDay`, consistência imóvel/unidade e unidade ocupada/com contrato ativo; criada suíte automatizada `tests/lease-wizard-validation.test.js`; criada documentação técnica e UX em `docs/SPRINT4_CONTRACT_WIZARD.md`; atualizado checklist temporal da Semana 4 com todos os itens concluídos.
- **Impacto no roadmap:** conclui integralmente a Semana 4 (Dias 16–20) e prepara base para geração automática de rendas na Semana 5.
- **Risco/rollback:** risco baixo (sem migração de schema); rollback por reversão dos arquivos de frontend/backend/documentação adicionados/alterados nesta sprint.

## 2026-04-18 (Sprint 5 — geração automática de rendas + máquina de estados)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** geração automática de cobrança por período, máquina de estados de rent charges, endpoint seguro de transição, logs de transição e documentação técnica
- **Descrição:** criado serviço `generateRentChargesForPeriod` (`lib/rent-generation.ts`) para automatizar criação de cobranças com controle de itens ignorados (`skipped`); evoluído endpoint `POST /api/invoices/generate` para usar serviço e registrar auditoria de batch; implementada máquina de estados em `lib/rent-state-machine.ts` com validação explícita de transições permitidas; criado endpoint protegido `POST /api/invoices/[invoiceId]/transition` para transições seguras por tenant; adicionado modelo/tabela `RentChargeTransitionLog` com migração `prisma/migrations/20260418201000_sprint5_rent_state_machine/migration.sql`; adicionados testes automatizados de transição inválida em `tests/rent-state-machine.test.js`; criada documentação técnica completa em `docs/SPRINT5_RENT_AUTOMATION_STATE_MACHINE.md`; atualizado checklist temporal da Semana 5 com itens concluídos.
- **Impacto no roadmap:** conclui integralmente a Semana 5 (Dias 21–25) e prepara base de cobrança para Sprint 6 (pagamentos/despesas) e Sprint 10/11 (reminders e automações conversacionais).
- **Risco/rollback:** risco moderado por introdução de endpoint de transição e novo schema de log; rollback estruturado via `prisma/migrations/20260418201000_sprint5_rent_state_machine/rollback.sql` e reversão dos handlers/libs da sprint.


## 2026-04-18 (Sprint 6 — núcleo financeiro)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** pagamentos com confirmação manual, comprovativo opcional, CRUD de despesas, lucro líquido e contratos financeiros de API
- **Descrição:** fluxo de pagamento evoluído para `AwaitingConfirmation` com comprovativo opcional (`receiptUrl`) e confirmação final manual via `POST /api/payments/:paymentId/confirm`; adicionados campos de confirmação em `Payment` com migração `prisma/migrations/20260418220000_sprint6_financial_core/migration.sql`; criada API completa de despesas (`GET/POST /api/expenses`, `PATCH/DELETE /api/expenses/:expenseId`) com isolamento por owner e auditoria; dashboard financeiro atualizado para receita confirmada, despesas mensais, lucro líquido e contagem de pendentes de confirmação; adicionados testes de regras de confirmação e transições atualizadas de máquina de estados; criada documentação técnica `docs/SPRINT6_FINANCIAL_CORE.md` e contratos detalhados em `docs/FINANCIAL_API_CONTRACTS.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 6 (Dias 26–30), fechando o núcleo financeiro para preparar Semana 7 (dashboard “atenção necessária”).
- **Risco/rollback:** risco moderado por alteração de schema e novo fluxo transacional de confirmação; rollback disponível em `prisma/migrations/20260418220000_sprint6_financial_core/rollback.sql`.

## 2026-04-18 (Sprint 7 — dashboard acionável de atenção diária)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** dashboard operacional, priorização diária, KPIs acionáveis, consistência visual e documentação técnica
- **Descrição:** endpoint `GET /api/dashboard` evoluído com modelo `attention` (resumo humano, ações rápidas, atenção por prioridade e 8 KPIs); criado service puro `buildDashboardAttentionModel` em `lib/dashboard-attention.ts`; frontend (`app/page.tsx`) revisado com blocos acionáveis e fallbacks explícitos de UI; aplicada camada visual semântica (`state-critical`, `state-warning`, `state-healthy`, `state-info`) em `app/globals.css`; criado documento de mapeamento KPI->ação (`docs/KPI_ACTION_MAPPING.md`) e documentação técnica completa da sprint (`docs/SPRINT7_ACTIONABLE_DASHBOARD.md`); adicionados testes automatizados do modelo de dados/rendering (`tests/dashboard-attention-model.test.js`).
- **Impacto no roadmap:** conclui integralmente a Semana 7 (Dias 31–35), preparando Semana 8 para refinamento de foco UX e microcopy.
- **Risco/rollback:** risco baixo/moderado (alteração de payload de dashboard e renderização); rollback por reversão dos arquivos da sprint, sem rollback de schema.


## 2026-04-18 (Sprint 9 — tickets operacionais com rastreabilidade)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** módulo de tickets no painel, máquina formal de estados, timeline de eventos, vínculos ticket->imóvel/unidade/contrato/inquilino, filtros por prioridade/estado e documentação técnica
- **Descrição:** implementadas rotas `GET/POST /api/tickets`, `PATCH /api/tickets/:ticketId`, `GET/POST /api/tickets/:ticketId/events`; endpoint legado `/api/maintenance` atualizado para estados formais e criação de timeline; criada máquina de estados em `lib/ticket-state-machine.ts`; painel (`app/page.tsx`) evoluído com criação e gestão de tickets, filtros e timeline visual; schema evoluído com novos campos em `MaintenanceTicket` e nova tabela `TicketEvent` via migração `prisma/migrations/20260418235000_sprint9_ticket_workflow/migration.sql`; adicionados testes `tests/ticket-flow.test.js`; criada documentação `docs/TICKET_STATE_MACHINE.md` e `docs/SPRINT9_TICKETS_OPERATIONS.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 9 (Dias 41–45), preparando automações de comunicação das Semanas 10 e 11 com base em tickets rastreáveis.
- **Risco/rollback:** risco moderado por mudança de schema + novas rotas; rollback estruturado em `prisma/migrations/20260418235000_sprint9_ticket_workflow/rollback.sql`.
## 2026-04-18 (Sprint 8 — UX de foco e microcopy)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** clareza de linguagem, hierarquia de CTA, empty states acionáveis, mensagens de feedback e consistência visual de demo
- **Descrição:** frontend principal (`app/page.tsx`) ajustado para reforçar 1 CTA primário por ecrã (hero com ação principal + link secundário), revisão de microcopy para contexto de senhorio, novos empty states orientados à ação em todas as listas, padronização de mensagens de erro/sucesso com fallback legível (`apiErrorMessage`) e melhoria de feedback no fluxo de WhatsApp; wizard de contratos (`app/components/lease-wizard.tsx`) recebeu mensagens de validação/sucesso mais claras; CSS (`app/globals.css`) ganhou classe `.inline-link` e refinamento visual de blocos vazios; criada documentação técnica da sprint (`docs/SPRINT8_UX_MICROCOPY.md`) e guia dedicado (`docs/MICROCOPY_GUIDE_V1.md`); checklist temporal atualizado com Semana 8 concluída.
- **Impacto no roadmap:** conclui integralmente a Semana 8 (Dias 36–40), preparando as próximas sprints com base de UX mais clara para demo e operações.
- **Risco/rollback:** risco baixo (sem mudança de schema nem contratos backend); rollback via reversão dos arquivos de UI/documentação da sprint.

## 2026-04-18 (Sprint 11 — WhatsApp inbound inquilino)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** fluxo inbound de inquilino, parser de intenção, deduplicação/throttling, vínculo telefone->contrato e rastreabilidade operacional
- **Descrição:** webhook `POST /api/whatsapp/webhook` atualizado para separar fluxo admin e fluxo de inquilino; criado service `lib/tenant-inbound.ts` com parser de intenção (`tenant_claimed_paid`, `tenant_problem_reported`, `tenant_promised_tomorrow`), resolução de contexto por telefone, anti-duplicação por `dedupeKey` e throttling por janela; aplicada atualização de estado de cobrança para `AwaitingConfirmation` quando inquilino declara pagamento; criada abertura automática de tickets por palavras-chave; adicionada tabela `WhatsAppInboundEvent` via migração `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/migration.sql`; incluídos testes automatizados de idempotência e concorrência (`tests/tenant-inbound-idempotency.test.js`) e documentação técnica completa em `docs/SPRINT11_WHATSAPP_INBOUND.md`.
- **Impacto no roadmap:** conclui integralmente a Semana 11 (Dias 51–55) com fluxo inbound funcional e rastreável.
- **Risco/rollback:** risco moderado (nova tabela e novo caminho transacional no webhook); rollback estruturado em `prisma/migrations/20260418235900_sprint11_whatsapp_inbound/rollback.sql`.
## 2026-04-18 (Sprint 10 — WhatsApp outbound real)
- **Autor:** Codex
- **Tipo:** feat
- **Escopo:** templates de cobrança, job diário de reminders, retry básico, persistência de mensagens/status e integração do botão “Cobrar agora”.
- **Descrição:** criado módulo de templates (`lib/whatsapp-templates.ts`) para lembrete/atraso/cobrança manual/confirmação; implementado serviço outbound (`lib/whatsapp-reminders.ts`) com criação de reminders, despacho com persistência em `WhatsAppMessage`, retry com `RetryScheduled` até 3 tentativas e logs operacionais; criado endpoint de job `POST /api/jobs/reminders/daily` com segredo dedicado; fluxo manual `POST /api/whatsapp/send-invoice` passou a usar o mesmo dispatcher (retornando `reminderId` e `providerMessageId`); adicionada cobertura automatizada de regras de template/retry em `tests/whatsapp-reminder-flow.test.js`; documentação técnica completa criada em `docs/SPRINT10_WHATSAPP_OUTBOUND.md` e `docs/WHATSAPP_PAYLOADS_SPRINT10.md`; checklist temporal da Semana 10 marcado como concluído.
- **Impacto no roadmap:** conclui integralmente a Semana 10 (Dias 46–50), preparando a Semana 11 para inbound WhatsApp com base em outbound rastreável e resiliente.
- **Risco/rollback:** risco moderado por nova automação e chamadas externas; rollback por desativação do job + reversão dos módulos/rotas da sprint (sem DDL).
