# Máquina de Estados de Ticket (Sprint 9)

Data: 2026-04-18

## Estados formais
- `New`
- `Triaged`
- `Waiting`
- `Resolved`
- `Closed`

## Transições permitidas
- `New -> Triaged | Waiting | Resolved | Closed`
- `Triaged -> Waiting | Resolved | Closed`
- `Waiting -> Triaged | Resolved | Closed`
- `Resolved -> Waiting | Closed`
- `Closed -> (nenhuma)`

## Regras operacionais
1. Ticket não pode transitar para o mesmo estado.
2. Ticket `Closed` é terminal.
3. `Waiting` permite retorno para `Triaged` (retriagem).
4. Toda transição cria um evento em timeline (`TicketEvent` tipo `StatusChanged`).

## Carimbos temporais por estado
- Ao entrar em `Triaged`: `triagedAt`.
- Ao entrar em `Waiting`: `waitingAt`.
- Ao entrar em `Resolved`: `resolvedAt`.
- Ao entrar em `Closed`: `closedAt`.
- Em qualquer mudança de estado/manual note: `currentEventAt`.

## Funções centrais
### `normalizeTicketPriority(value, fallback)`
- Objetivo: normalizar prioridade.
- Entrada: valor livre (`unknown`), fallback opcional.
- Saída: `Low|Normal|High|Urgent`.
- Erros: `Invalid ticket priority`.
- Efeito colateral: nenhum.

### `normalizeTicketStatus(value, fallback)`
- Objetivo: normalizar estado formal.
- Entrada: valor livre (`unknown`), fallback opcional.
- Saída: `New|Triaged|Waiting|Resolved|Closed`.
- Erros: `Invalid ticket status`.
- Efeito colateral: nenhum.

### `assertTicketTransitionAllowed({ fromStatus, toStatus })`
- Objetivo: validar transição.
- Entrada: estado origem e destino.
- Saída: `{ normalizedFrom, normalizedTo }`.
- Erros: transição inválida/igual.
- Efeito colateral: nenhum.

### `ticketTransitionTimestamps({ fromStatus, toStatus, now })`
- Objetivo: computar patch de timestamps por transição.
- Entrada: origem, destino e `now` opcional.
- Saída: `{ normalizedFrom, normalizedTo, patch }`.
- Erros: propaga erros de transição inválida.
- Efeito colateral: nenhum.
