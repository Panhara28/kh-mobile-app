/**
 * The new-store journey on kh-pos-on-the-phone (see local-server.test.ts): blank database -> register -> sign in ->
 * store setup -> a product and a table -> open the shift -> order at the table -> pay. Shared by the tests that run it
 * with Node's own modules and with the phone's stand-ins for them.
 */
import { emptyCategoryForm, saveBody } from '../lib/categories';
import { KhPosApi, type MenuProduct } from '../lib/api';
import { addToTable } from '../lib/order';
import { createBody, newProductForm } from '../lib/product-form';
import { typeBody, type SetupStatus } from '../lib/setup';
import type { SqlDriver } from './driver';
import { migrate } from './migrate';
import { localFetch } from './server';
// @ts-ignore generated
import migrations from '../../core/migrations.json';
// @ts-ignore generated
import { setDriver } from '../../core/db/db';

interface NodeDb {
  prepare(sql: string): { all(...a: unknown[]): unknown[]; run(...a: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint } };
  exec(sql: string): void;
}
declare const require: (m: string) => { DatabaseSync: new (path: string) => NodeDb };

/** node:sqlite with the same shape as the phone's expo-sqlite driver (src/local/phone.ts). */
function nodeDriver(db: NodeDb): SqlDriver {
  const bind = (args: unknown[]) => args.map((a) => (a === undefined ? null : a));
  return {
    all: (sql, args) => db.prepare(sql).all(...bind(args)) as Record<string, unknown>[],
    run: (sql, args) => {
      const r = db.prepare(sql).run(...bind(args));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    exec: (sql) => db.exec(sql),
  };
}

export function newStoreJourney(title: string) {
  let token: string | null = null;
  const api = new KhPosApi('http://phone.local', () => token, localFetch as unknown as typeof fetch);
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  let warehouseId = '';

  beforeAll(() => {
    const { DatabaseSync } = require('node:sqlite');
    const db = nodeDriver(new DatabaseSync(':memory:'));
    expect(migrate(db, migrations as { name: string; sql: string }[]).length).toBeGreaterThan(0);
    setDriver(db);
  });

  describe(title, () => {
    it('a blank phone has no users, so the app opens on Register', async () => {
      expect(await api.call('GET', '/api/user/has-user')).toMatchObject({ success: true, result: false });
    });

    it('registers the first store and owner, then refuses a second registration', async () => {
      const body = { ownerName: 'Panhara', warehouseName: 'Panhara Cafe', address: 'Phnom Penh', phoneNumber: '012345678', userName: 'panhara', password: '123123' };
      await api.call('POST', '/api/user/first-user', body);
      expect(await api.call('GET', '/api/user/has-user')).toMatchObject({ result: true });
      await expect(api.call('POST', '/api/user/first-user', body)).rejects.toMatchObject({ status: 409 });
    });

    it('signs the owner in (and refuses a wrong password)', async () => {
      await expect(api.login('panhara', 'nope')).rejects.toMatchObject({ kind: 'invalidCredentials' });
      token = await api.login('panhara', '123123');
      const me = await api.me();
      expect(me.username).toBe('panhara');
      expect(me.role?.role).toBe('OWNER');
      warehouseId = me.currentWarehouseId!;
      expect(warehouseId).toBeTruthy();
    });

    it('refuses to sell before the store setup is finished, like the web', async () => {
      await expect(api.openShift({ openedCashUsd: 0, openedCashKhr: 0, exchangeRate: 4100 })).rejects.toMatchObject({ status: 409 });
    });

    it('runs the store setup as a small restaurant', async () => {
      const put = (body: Record<string, unknown>) => api.call<{ result: SetupStatus }>('PUT', '/api/setup', body);
      let s = (await api.call<{ result: SetupStatus }>('GET', '/api/setup')).result;
      expect(s.complete).toBe(false);
      await put({ step: 'store', name: 'Panhara Cafe', phone: '012345678', address: 'Phnom Penh', logo: '' });
      await put(typeBody('SMALL_RESTAURANT'));
      await put({ step: 'currency', currency: 'USD', exchangeRate: 4100 });
      await put({ step: 'payment' });

      await api.call('POST', '/api/category', saveBody({ ...emptyCategoryForm(), title: 'Drinks' }));
      const cats = (await api.call<{ result: { data?: { id: string }[] } | { id: string }[] }>('GET', '/api/category')).result;
      const list = Array.isArray(cats) ? cats : (cats.data ?? []);
      expect(list.length).toBe(1);
      const printerId = newId();
      await put({ step: 'printers', printers: [{ id: printerId, name: 'Kitchen', printerName: 'Kitchen', ip: '192.168.1.50', port: 9100 }], categories: list.map((c) => ({ categoryId: c.id, printerId })) });

      await api.createTable({ tableNumber: 'T-01', seatingCapacity: 4, section: 'Main', tableShape: 'square', features: [] });
      s = (await put({ step: 'tables', tableMode: 'NORMAL', tagCount: 1 })).result;
      expect(s.steps.filter((x) => !x.done).map((x) => x.key)).toEqual([]);
      await api.call('POST', '/api/setup');
      s = (await api.call<{ result: SetupStatus }>('GET', '/api/setup')).result;
      expect(s.complete).toBe(true);
      expect(s.systemType).toBe('RESTAURANT');
      expect(s.edition).toBe('LITE');
    });

    it('adds a product to the menu', async () => {
      const cats = (await api.call<{ result: { data?: { id: string }[] } | { id: string }[] }>('GET', '/api/category')).result;
      const categoryId = (Array.isArray(cats) ? cats : (cats.data ?? []))[0]!.id;
      const f = newProductForm(newId);
      f.title = 'Iced Latte';
      f.categoryId = categoryId;
      f.isForSale = true;
      f.variants[0]!.price = 2.5;
      await api.call('POST', '/api/product-v2', createBody(f));
      const menu = await api.menu({ warehouse: warehouseId, limit: 50, offset: 0 });
      expect(menu.map((p) => p.productTitle).join()).toContain('Iced Latte');
    });

    it('opens the shift, takes an order at the table and is paid', async () => {
      await api.openShift({ openedCashUsd: 20, openedCashKhr: 0, exchangeRate: 4100 });
      const product = (await api.menu({ warehouse: warehouseId, limit: 50, offset: 0 })).find((p) => p.productTitle.includes('Iced Latte')) as MenuProduct;
      const table = (await api.tables()).find((t) => t.table_name === 'T-01')!;
      expect(table).toBeTruthy();
      await addToTable(api, { table, warehouseId, product, qty: 2, options: [], note: '' }, newId);

      const open = await api.table(table.id);
      expect(open.order).toBeTruthy();
      const orderId = open.order!.orderId;
      const info = await api.posInfo(warehouseId);
      const method = (await api.paymentMethods())[0]!;
      await api.checkout(orderId, { slotId: info.posSlotId, payments: [{ amount: 5, paymentMethod: method.method_id, currency: 'USD', amountUsd: 5, exchangeRate: 4100, used: 5 }] });

      const done = await api.orderDetail(orderId);
      expect(JSON.stringify(done)).toContain('COMPLETED');
    });
  });
}
