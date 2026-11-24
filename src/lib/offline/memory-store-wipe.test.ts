import { MemoryStore } from './memory-store';

describe('clearing the phone', () => {
  it('lists saved keys by prefix and empties everything', async () => {
    const s = new MemoryStore();
    await s.setCache('profile:dara', { id: 'u1' });
    await s.setCache('profile:sokha', { id: 'u2' });
    await s.setCache('menu:w1', []);
    await s.outboxAdd({ id: 'c1', userId: 'u1', kind: 'addLine', tableId: 't1', payload: {}, createdAt: 1 } as never);
    expect((await s.cacheKeys('profile:')).sort()).toEqual(['profile:dara', 'profile:sokha']);
    await s.clearAll();
    expect(await s.cacheKeys('')).toEqual([]);
    expect(await s.outboxList()).toEqual([]);
    expect(await s.getCache('menu:w1')).toBeNull();
  });
});
