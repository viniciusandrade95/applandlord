# applandlord

MVP de gestao imobiliaria com Next.js, Prisma e PostgreSQL.

## O que já existe

- Cadastro de propriedades, unidades e inquilinos
- Criação de contratos de locação
- Geração mensal de faturas
- Registro manual de pagamentos
- Tickets simples de manutenção
- Painel com métricas básicas de operação

## Como rodar

1. `npm install`
2. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`
3. `npm run db:push`
4. `npm run dev`

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
