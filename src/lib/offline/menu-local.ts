import type { MenuProduct, MenuQuery } from '../api';

/**
 * The menu query answered from the saved copy of the whole menu, for when kh-pos can't be
 * reached: same search (case-insensitive, on the dish title), category filter and paging as the
 * server query the app normally uses.
 */
export function filterMenu(all: MenuProduct[], q: Pick<MenuQuery, 'search' | 'categoryId' | 'limit' | 'offset'>): MenuProduct[] {
  const needle = (q.search ?? '').toLowerCase().trim();
  const rows = all.filter(
    (p) => (!q.categoryId || p.category?.id === q.categoryId) && (!needle || p.productTitle.toLowerCase().includes(needle)),
  );
  return rows.slice(q.offset, q.offset + q.limit);
}
