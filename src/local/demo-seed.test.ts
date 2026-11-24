/** The demo small restaurant, made on a blank phone database through kh-pos on the phone (like the web demo seed). */
import { KhPosApi } from '../lib/api';
import { storeKind } from '../lib/business-type';
import { pickSetting } from '../lib/settings';
import { DEMO_PASSWORD, DEMO_STAFF, seedDemoRestaurant } from './demo-seed';
import { nodeDriver } from './journey';
import { migrate } from './migrate';
import { localFetch } from './server';
// @ts-ignore generated
import migrations from '../../core/migrations.json';
// @ts-ignore generated
import { setDriver } from '../../core/db/db';

declare const require: (m: string) => any;

let token: string | null = null;
const api = new KhPosApi('http://phone.local', () => token, localFetch as unknown as typeof fetch);

describe('demo small restaurant on the phone', () => {
  jest.setTimeout(120_000);

  it('seeds the store, staff, menu, tables and a week of sales', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const sql = nodeDriver(new DatabaseSync(':memory:'));
    migrate(sql, migrations as { name: string; sql: string }[]);
    setDriver(sql);
    const steps: string[] = [];
    const { orders } = await seedDemoRestaurant({ fetch: localFetch as never, sql, newId: () => require('node:crypto').randomUUID(), onProgress: (_d, w) => steps.push(w) });
    expect(orders).toBeGreaterThan(50);
    expect(steps.at(-1)).toBe('done');
    await expect(seedDemoRestaurant({ fetch: localFetch as never, sql, newId: () => 'x' })).rejects.toThrow(/already has users/);
  });

  it('every demo user signs in with 123123, with their role', async () => {
    for (const s of DEMO_STAFF) {
      token = await api.login(s.username, DEMO_PASSWORD);
      const me = await api.me();
      expect(me.username).toBe(s.username);
      expect(me.role?.role).toBe(s.role === 'Owner' ? 'OWNER' : s.role);
    }
  });

  it('is a finished small restaurant with its menu, 12 tables and three tables eating now', async () => {
    token = await api.login('panhara', DEMO_PASSWORD);
    const me = await api.me();
    const wh = me.currentWarehouseId!;
    expect((await api.call<{ result: { complete: boolean } }>('GET', '/api/setup')).result.complete).toBe(true);
    expect(storeKind(pickSetting(await api.settings(wh), 'TYPE_POS', wh))).toEqual({ type: 'RESTAURANT', edition: 'LITE' });
    const menu = await api.menu({ warehouse: wh, limit: 100, offset: 0 });
    expect(menu.length).toBe(19);
    const tables = await api.tables();
    expect(tables.length).toBe(12);
    expect(tables.filter((t) => t.order).length).toBe(3);
  });
});
