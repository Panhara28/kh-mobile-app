import { fetchAllPages } from './catalog';

describe('paging', () => {
  it('reads every page until the total is reached', async () => {
    const all = Array.from({ length: 230 }, (_, i) => i);
    const calls: number[] = [];
    const rows = await fetchAllPages(async (offset, limit) => {
      calls.push(offset);
      return { data: all.slice(offset, offset + limit), total: all.length };
    });
    expect(rows).toHaveLength(230);
    expect(calls).toEqual([0, 100, 200]);
  });
  it('stops on an empty page, and on a short one', async () => {
    expect(await fetchAllPages(async () => ({ data: [], total: 999 }))).toEqual([]);
    expect(await fetchAllPages(async () => ({ data: [1, 2], total: 999 }))).toEqual([1, 2]);
  });
});
