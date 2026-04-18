# Governança de Alterações

## Regra obrigatória para qualquer alteração
Toda e qualquer alteração no projeto **deve** incluir:

1. **Log da alteração** em `CHANGELOG.md` (ou criação desse arquivo, caso não exista).
2. **Atualização do checklist temporal** (`TEMPORAL_CHECKLIST.md`) marcando:
   - tarefa concluída,
   - tarefa adicionada,
   - tarefa alterada,
   - risco novo identificado.
3. **Referência à semana/dia** impactado no roadmap.

4. **Atualização dos prompts de sprint** em `CODEX_SPRINT_PROMPTS.md` quando houver mudança de escopo, regras ou critérios de aceite.

## Regra de documentação de implementação
Para qualquer código implementado, é obrigatório documentar:
- função criada/alterada (objetivo, entrada, saída, erros e efeitos colaterais);
- como testar (manual e automatizado);
- contratos de dados (entrada e saída) para APIs, jobs e integrações.

## Formato mínimo do log
Cada entrada no changelog deve conter:
- Data (AAAA-MM-DD)
- Autor
- Tipo: feat | fix | docs | refactor | chore
- Escopo
- Descrição objetiva da mudança
- Impacto no roadmap (semana)
- Risco/rollback (se houver)

## Política de revisão
Nenhum PR deve ser aprovado sem:
- entrada de changelog correspondente;
- atualização do checklist temporal correspondente.
