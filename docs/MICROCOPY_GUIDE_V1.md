# Guia de Microcopy v1 (Sprint 8)

Data: 2026-04-18

## Objetivo
Reduzir carga cognitiva no painel do senhorio com texto direto, orientado a ação e com contexto operacional.

## Princípios
1. **Uma decisão por bloco**: cada área da interface deve deixar claro qual é o próximo passo.
2. **Verbo de ação no imperativo**: usar "Registar", "Gerar", "Confirmar", "Abrir".
3. **Linguagem de senhorio**: priorizar termos do domínio (`imóvel`, `unidade`, `inquilino`, `cobrança`, `pedido de manutenção`).
4. **Mensagem de erro com recuperação**: sempre que possível, indicar o que falta para avançar.
5. **Estado vazio com direção**: quando não há dados, mostrar ação concreta com link para o campo inicial.

## Padrões de escrita

### Sucesso
- Estrutura: **[Objeto] + [resultado] + [próximo passo opcional]**.
- Exemplo: `Contrato criado com sucesso. A próxima cobrança já pode ser gerada.`

### Erro
- Estrutura: **Não foi possível + [ação] + [causa implícita/ação de correção]**.
- Exemplo: `Não foi possível identificar a fatura ou o inquilino para envio.`

### CTA principal
- 1 CTA principal por ecrã/seção (botão primário).
- CTAs secundários em formato de link textual para evitar competição visual.

### Empty state
- Estrutura em 3 linhas:
  1. título de ausência (`Ainda não existem ...`)
  2. contexto operacional (`... para desbloquear ...`)
  3. CTA (`Registar ...`).

## Vocabulário preferencial (v1)
- `fatura` -> `cobrança` (quando o objetivo é gestão operacional de cobrança)
- `ticket` -> `pedido de manutenção`
- `cadastros` -> `base do portfólio`
- `criar` -> `registar` (quando persistência administrativa é o foco)

## Anti‑padrões evitados
- Mensagens genéricas: `Falha na operação`.
- Mensagens sem ação: `Ainda não há dados`.
- Duplicidade de CTA primário no mesmo bloco hero.

## Do / Don't
- ✅ `Registar primeiro imóvel`
- ❌ `Começar`
- ✅ `Gerar cobranças do período`
- ❌ `Executar`
- ✅ `Não foi possível registar a unidade.`
- ❌ `Erro interno`
