# applandlord

MVP de gestão imobiliária com Next.js, Prisma e SQLite.

## O que já existe

- Cadastro de propriedades, unidades e inquilinos
- Criação de contratos de locação
- Geração mensal de faturas
- Registro manual de pagamentos
- Tickets simples de manutenção
- Painel com métricas básicas de operação

## Como rodar

1. `npm install`
2. Copie `.env.example` para `.env`
3. `npm run db:push`
4. `npm run dev`

## Scripts

- `npm run dev` inicia o ambiente local
- `npm run build` gera o build de produção
- `npm run db:push` aplica o schema no SQLite de desenvolvimento
- `npm run prisma:generate` recria o client do Prisma
