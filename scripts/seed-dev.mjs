#!/usr/bin/env node
/**
 * Development seed for the KH POS staff app, through the kh-pos admin API only (kh-pos hashes
 * passwords and builds products itself). Safe to run again: existing items are skipped.
 *
 *   KHPOS_URL=http://localhost:3001 ADMIN_USERNAME=admin ADMIN_PASSWORD=... \
 *   STAFF_USERNAME=staff1 STAFF_PASSWORD=... node scripts/seed-dev.mjs
 *
 * Creates:
 *  - a "Staff" role (orders, tables, kitchen; read-only products and categories),
 *  - a staff user in the admin's branch (password generated and printed if not given),
 *  - a small sample menu (Drinks, Food, Desserts).
 * Never point this at a production server.
 */
import { randomBytes, randomUUID } from 'node:crypto';

const BASE = (process.env.KHPOS_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STAFF_USERNAME = process.env.STAFF_USERNAME ?? 'staff1';
const STAFF_PASSWORD = process.env.STAFF_PASSWORD ?? `staff-${randomBytes(4).toString('hex')}`;
const STAFF_FULLNAME = process.env.STAFF_FULLNAME ?? 'Staff One';

const STAFF_PERMISSIONS = {
  order: 'create,read,update',
  restaurant: 'read,create,update',
  'order-preparation': 'read,create,update',
  product: 'read',
  category: 'read',
};

const MENU = [
  {
    category: 'Drinks',
    items: [
      { title: 'Iced Latte', price: 2.5, cost: 0.9 },
      { title: 'Lemon Tea', price: 1.5, cost: 0.4 },
      { title: 'Fresh Coconut', price: 1.75, cost: 0.6 },
    ],
  },
  {
    category: 'Food',
    items: [
      { title: 'Fried Rice', price: 3, cost: 1.2 },
      { title: 'Beef Lok Lak', price: 4.5, cost: 2 },
      { title: 'Fish Amok', price: 5, cost: 2.2 },
    ],
  },
  {
    category: 'Desserts',
    items: [{ title: 'Mango Sticky Rice', price: 2, cost: 0.8 }],
  },
];

let token = '';

async function api(method, path, body, { auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json'; // kh-pos needs this exact value
  if (auth && token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path}: HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  if (!res.ok || json?.success === false || (json && typeof json.error === 'string' && !json.result)) {
    throw new Error(`${method} ${path}: HTTP ${res.status} ${json?.error ?? text.slice(0, 200)}`);
  }
  return json;
}

function done(what) {
  console.log(`  ✓ ${what}`);
}

async function main() {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD (a kh-pos OWNER/admin account).');
  }
  console.log(`Seeding ${BASE}`);

  const login = await api('POST', '/api/auth/login', { username: ADMIN_USERNAME, password: ADMIN_PASSWORD }, { auth: false });
  token = login.token;
  const me = (await api('GET', '/api/user/me')).user;
  const warehouseId = me.currentWarehouseId;
  if (!warehouseId) throw new Error('The admin account has no branch (warehouse).');
  done(`logged in as ${ADMIN_USERNAME}, branch ${me.warehouse?.name ?? warehouseId}`);

  // Role
  const findRole = async () => (await api('GET', '/api/user/role')).find((r) => r.role?.toLowerCase() === 'staff');
  let role = await findRole();
  if (!role) {
    await api('POST', '/api/user/role', { role: 'Staff', permissions: JSON.stringify(STAFF_PERMISSIONS) });
    role = await findRole();
    if (!role) throw new Error('Staff role was not created');
    done('created role "Staff"');
  } else {
    done('role "Staff" already exists');
  }

  // Staff user
  const users = (await api('GET', '/api/user?limit=500&offset=0')).result?.data ?? [];
  let staffPassword = STAFF_PASSWORD;
  if (users.some((u) => u.username === STAFF_USERNAME)) {
    staffPassword = null;
    done(`user "${STAFF_USERNAME}" already exists (password unchanged)`);
  } else {
    await api('POST', '/api/user', {
      username: STAFF_USERNAME,
      password: STAFF_PASSWORD,
      // kh-pos derives the login token from the phone number, so keep it unique.
      phoneNumber: `0${String(Date.now()).slice(-9)}`,
      fullname: STAFF_FULLNAME,
      profile: '',
      roleId: role.id,
      warehouseId,
    });
    done(`created user "${STAFF_USERNAME}" (role Staff)`);
  }

  // Sample menu
  const categories = (await api('GET', `/api/category/menu?warehouse=${warehouseId}`, undefined, { auth: false })).result?.data ?? [];
  for (const section of MENU) {
    let category = categories.find((c) => c.title === section.category);
    if (!category) {
      category = (await api('POST', '/api/category', { title: section.category, imageUrl: null, parentId: null, printerId: null })).result;
      done(`created category ${section.category}`);
    }
    for (const item of section.items) {
      const found = (await api('GET', `/api/product-v2/menu?search=${encodeURIComponent(item.title.toLowerCase())}&limit=5&offset=0&warehouse=${warehouseId}`, undefined, { auth: false })).result ?? [];
      if (found.some((p) => p.productTitle?.startsWith(item.title))) continue;
      const optionValue = { id: randomUUID(), value: 'Regular' };
      await api('POST', '/api/product-v2', {
        productBasic: { title: item.title, description: '', isForSale: true, trackStock: false },
        productCategories: [{ categoryId: category.id }],
        productImages: [],
        productOption: [{ id: randomUUID(), name: 'Size', values: [optionValue] }],
        productVariants: [
          {
            id: randomUUID(),
            name: 'Regular',
            price: item.price,
            available: true,
            isDefault: true,
            optionValues: [optionValue],
            purchasedCost: item.cost,
          },
        ],
        productConversions: [],
      });
      done(`created ${item.title} ($${item.price.toFixed(2)})`);
    }
  }

  console.log('\nStaff login for the mobile app:');
  console.log(`  username: ${STAFF_USERNAME}`);
  console.log(`  password: ${staffPassword ?? '(unchanged; user already existed)'}`);
}

main().catch((e) => {
  console.error(`\nSeed failed: ${e.message}`);
  process.exit(1);
});
