# Sprint 4 — Wizard de contrato (frontend + backend)

## Objetivo da sprint
Implementar fluxo guiado de criação de contrato (4–5 passos) com criação/seleção de inquilino no mesmo fluxo, validações de consistência (imóvel, unidade, datas e `due_day`), tela de confirmação, tratamento de erros legíveis e cobertura de testes de validação de entrada/saída.

## UX do wizard: estados e transições

### Estados
1. **Passo 1 — Imóvel e unidade**
   - Seleção de `propertyId` e `unitId`.
   - Unidade é filtrada pelo imóvel selecionado.
2. **Passo 2 — Inquilino**
   - Modo `existing` (seleciona `renterId`) **ou** modo `new` (cria inquilino com nome obrigatório).
3. **Passo 3 — Condições contratuais**
   - `startDate`, `endDate` opcional, `monthlyRent`, `dueDay`, `depositAmount`, `status`, `notes`.
4. **Passo 4 — Confirmação**
   - Resumo de todo o contrato antes da gravação.
5. **Passo 5 — Sucesso**
   - Confirma persistência e permite reiniciar wizard.

### Transições
- `1 -> 2`: requer imóvel e unidade.
- `2 -> 3`: requer inquilino válido (existente ou novo com nome).
- `3 -> 4`: requer datas válidas, renda > 0, `dueDay` entre 1 e 28.
- `4 -> 5`: submit `POST /api/leases` com feedback de sucesso.
- `Voltar`: sempre retorna ao passo anterior (exceto passo 1).
- Qualquer validação inválida mantém estado atual e mostra erro amigável.

## Backend/API alterada

### Endpoint alterado: `POST /api/leases`

#### Contrato de entrada (body)
```json
{
  "propertyId": "string",
  "unitId": "string",
  "renterMode": "existing | new",
  "renterId": "string (obrigatório quando existing)",
  "newRenterFullName": "string (obrigatório quando new)",
  "newRenterEmail": "string opcional",
  "newRenterPhone": "string opcional",
  "newRenterGovernmentId": "string opcional",
  "newRenterNotes": "string opcional",
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD | null",
  "monthlyRent": "number > 0",
  "depositAmount": "number >= 0",
  "dueDay": "int [1..28]",
  "status": "Active | Planned | Ended",
  "notes": "string opcional"
}
```

#### Contrato de saída
- **201**: contrato criado com `property`, `unit`, `renter`.
- **400**: payload inválido (datas, due day, campos obrigatórios, inconsistência imóvel/unidade, inquilino inválido).
- **404**: imóvel/unidade inexistentes para o `ownerId`.
- **409**: unidade já ocupada ou com contrato ativo.
- **500**: erro inesperado.

#### Autenticação/autorização
- Sessão obrigatória (`requireCurrentUserId`).
- Todas as consultas/escritas filtradas por `ownerId`.

#### Casos de erro e mensagens
- "Selecione um inquilino existente para continuar."
- "Informe o nome completo do novo inquilino."
- "Imóvel, unidade e renda mensal válida são obrigatórios."
- "O dia de vencimento deve estar entre 1 e 28."
- "A unidade selecionada não pertence ao imóvel informado."
- "A unidade já possui contrato ativo."
- "A unidade está marcada como ocupada e não pode receber novo contrato ativo."

## Funções criadas/alteradas (objetivo, entradas, saídas, erros, efeitos colaterais)

### `parseLeaseWizardPayload(body)` (`lib/lease-wizard.ts`)
- **Objetivo:** normalizar o payload bruto do wizard para tipo de domínio.
- **Entradas:** `unknown` com dados do request.
  - Validações: obrigatórios por modo (`existing/new`), IDs, renda > 0.
  - Exemplo: `{ propertyId:"p1", unitId:"u1", renterMode:"new", newRenterFullName:"Ana", monthlyRent:850 }`.
- **Saída:** `LeaseWizardPayload` tipado.
- **Erros:** lança `Error` com mensagens amigáveis quando faltam campos.
- **Efeitos colaterais:** nenhum.

### `validateLeaseSchedule(startDate, endDate, dueDay)` (`lib/lease-wizard.ts`)
- **Objetivo:** validar consistência temporal e `dueDay`.
- **Entradas:** `Date`, `Date|null`, `number`.
  - Regras: início válido, fim não anterior ao início, `dueDay` inteiro entre 1 e 28.
- **Saída:** `void`.
- **Erros:** lança `Error` detalhando regra quebrada.
- **Efeitos colaterais:** nenhum.

### `validateLeaseRelations({ unitPropertyId, selectedPropertyId, unitStatus, activeLeaseCountForUnit })` (`lib/lease-wizard.ts`)
- **Objetivo:** validar consistência de relacionamento e disponibilidade da unidade.
- **Entradas:** objeto com IDs/status e contagem de contratos ativos.
- **Saída:** `void`.
- **Erros:** lança `Error` para unidade inválida, ocupada ou com contrato ativo.
- **Efeitos colaterais:** nenhum.

### `resolveRenterId(payload, ownerId)` (`app/api/leases/route.ts`)
- **Objetivo:** resolver `renterId`, criando inquilino quando `renterMode = new`.
- **Entradas:** payload normalizado + `ownerId`.
- **Saída:** `Promise<string>` com ID do inquilino.
- **Erros:** inquilino inexistente no modo `existing`.
- **Efeitos colaterais:** pode inserir registro em `Renter`.

### `POST(request)` em `app/api/leases/route.ts`
- **Objetivo:** persistir contrato do wizard no backend.
- **Entradas:** body JSON do endpoint.
- **Saída:** `NextResponse` (201/400/404/409/500).
- **Erros:** mapeamento de validações para status corretos.
- **Efeitos colaterais:** cria contrato, opcionalmente cria inquilino, atualiza unidade para `Occupied`/`Vacant`, grava auditoria.

### `LeaseWizard(props)` (`app/components/lease-wizard.tsx`)
- **Objetivo:** orquestrar o fluxo de 5 passos no frontend.
- **Entradas:** opções de imóvel/unidade/inquilino, callback de submit, setter de aviso.
- **Saída:** JSX do wizard com estados/transições.
- **Erros:** validação incremental local + feedback vindo da API.
- **Efeitos colaterais:** chamada `POST /api/leases` no passo 4.

## Mudanças de dados
- **Schema afetado:** nenhum campo/tabela novo no Prisma.
- **Migração aplicada:** não aplicável nesta sprint (somente lógica).
- **Impacto em dados existentes:** sem alteração estrutural; criação de contrato agora pode criar inquilino no mesmo fluxo.
- **Rollback:** reverter alterações de `app/api/leases/route.ts`, `lib/lease-wizard.ts` e `app/components/lease-wizard.tsx`.

## Testes

### Como testar manualmente (passo a passo)
1. Login com usuário válido.
2. Acessar seção **Contratos** > painel **Criar contrato**.
3. Passo 1: escolher imóvel/unidade e avançar.
4. Passo 2: testar modo **Selecionar existente** e **Criar novo**.
5. Passo 3: preencher datas/renda/due day; validar erro para `dueDay=30`.
6. Passo 4: revisar resumo; confirmar criação.
7. Passo 5: confirmar mensagem de sucesso.
8. Verificar em **Contratos ativos** se novo contrato apareceu.

### Testes automatizados executados
- `node --test tests/lease-wizard-validation.test.js`.
- Cobertura de cenários: entrada mínima válida, inquilino ausente no modo existente, `dueDay` inválido, inconsistência imóvel/unidade e unidade ocupada/ativa.

### Evidência de sucesso
- Suite de testes com todos os casos passando.
- Fluxo visual de wizard em 5 passos renderizado no frontend.
- Endpoint retorna erros claros por tipo de validação.
