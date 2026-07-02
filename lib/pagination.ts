/**
 * Paginação por cursor para os endpoints de listagem.
 *
 * Contrato de resposta paginada: `{ items, nextCursor, total }`
 * - `items`: página atual (nunca a coleção inteira);
 * - `nextCursor`: id do último item quando existe mais uma página, senão null;
 * - `total`: contagem total do filtro aplicado (para "X de Y" na interface).
 *
 * Parâmetros aceites: `take` (limitado por `maxTake`), `cursor` (id), `q` (pesquisa).
 */
export type Paged<T> = { items: T[]; nextCursor: string | null; total: number }

export function parsePageParams(
  url: string,
  defaults: { take?: number; maxTake?: number } = {}
) {
  const { searchParams } = new URL(url)
  const rawTake = Number(searchParams.get('take'))
  const maxTake = defaults.maxTake ?? 100
  const take =
    Number.isFinite(rawTake) && rawTake > 0
      ? Math.min(Math.trunc(rawTake), maxTake)
      : defaults.take ?? 25
  const cursor = searchParams.get('cursor') || null
  const q = (searchParams.get('q') || '').trim()
  return { take, cursor, q, searchParams }
}

/** Corta a página (buscada com take+1) e calcula o cursor seguinte. */
export function pageResult<T extends { id: string }>(rows: T[], take: number, total: number): Paged<T> {
  const hasMore = rows.length > take
  const items = hasMore ? rows.slice(0, take) : rows
  return { items, nextCursor: hasMore && items.length ? items[items.length - 1].id : null, total }
}
