# applandlord

MVP de gestao imobiliaria com Next.js, Prisma e PostgreSQL.

## O que já existe

- Cadastro de propriedades, unidades e inquilinos
- Criação de contratos de locação
- Geração mensal de faturas
- Registro manual de pagamentos
- Tickets simples de manutenção
- Envio de faturas por WhatsApp
- Webhook com menu interativo de WhatsApp para listar e criar registos simples
- Painel com métricas básicas de operação

## Como rodar

1. `npm install`
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`
3. `npm run db:push`
4. `npm run dev`

## WhatsApp

Configure estas variáveis no `.env`:

- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_WEBHOOK_SECRET`
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
- `WHATSAPP_ADMIN_NUMBERS`

Rotas disponíveis:

- `POST /api/whatsapp/send-invoice`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`

Fluxos suportados:

- envio manual de fatura pelo painel
- abertura de menu pelo texto `menu`
- listar e criar inquilinos
- listar e criar imoveis
- listar contratos
- listar faturas em aberto e enviar uma fatura por WhatsApp

## Deploy no Render

- O repositório inclui `render.yaml`
- Crie um Blueprint no Render conectando este repo
- O blueprint provisiona um Postgres e um Web Service
- O `DATABASE_URL` vem automaticamente do banco

## Scripts

- `npm run dev` inicia o ambiente local
- `npm run build` gera o build de produção
- `npm run db:push` aplica o schema no banco definido em `DATABASE_URL`
- `npm run prisma:generate` recria o client do Prisma
