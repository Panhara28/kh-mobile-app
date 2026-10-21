import {
  ACTIONS,
  RESOURCES,
  addResource,
  availableResources,
  createRoleBody,
  isEnabled,
  parsePermissions,
  removeResource,
  resourceLabel,
  serializePermissions,
  togglePermission,
  toRoles,
  updateRoleBody,
  validateRoleName,
} from './accessibility';

describe('reading and writing permissions', () => {
  it('reads the stored text, or an object, and tolerates garbage', () => {
    expect(parsePermissions('{"order":"create,read","product":"read"}')).toEqual({ order: ['create', 'read'], product: ['read'] });
    expect(parsePermissions({ order: 'create, update', table: ['read'] })).toEqual({ order: ['create', 'update'], table: ['read'] });
    expect(parsePermissions('oops')).toEqual({});
    expect(parsePermissions(null)).toEqual({});
    expect(parsePermissions(undefined)).toEqual({});
  });
  it('writes only the resources that still have an action', () => {
    expect(serializePermissions({ order: ['create', 'read'], table: [] })).toBe('{"order":"create,read"}');
    expect(serializePermissions({})).toBe('{}');
  });
  it('keeps the order the web stores', () => {
    expect(ACTIONS).toEqual(['create', 'update', 'delete', 'read']);
    expect(serializePermissions(parsePermissions('{"a":"create,update,delete,read"}'))).toBe('{"a":"create,update,delete,read"}');
  });
  it('turns a role row into a role', () => {
    expect(toRoles([{ id: 'r', role: 'Cashier', permissions: '{"pos":"read"}' }])).toEqual([{ id: 'r', role: 'Cashier', permissions: { pos: ['read'] } }]);
  });
});

describe('changing a role', () => {
  it('turns one action on or off without touching the others', () => {
    const p = { order: ['read'] as ('create' | 'update' | 'delete' | 'read')[] };
    const on = togglePermission(p, 'order', 'update', true);
    expect(on.order).toEqual(['read', 'update']);
    expect(togglePermission(on, 'order', 'update', false).order).toEqual(['read']);
    expect(togglePermission(on, 'order', 'update', true).order).toEqual(['read', 'update']);
    expect(togglePermission(p, 'order', ['create', 'delete'], true).order).toEqual(['read', 'create', 'delete']);
  });
  it('adds a resource with every action, once', () => {
    const added = addResource({}, 'table');
    expect(added.table).toEqual(['create', 'update', 'delete', 'read']);
    expect(addResource(added, 'table')).toBe(added);
    expect(addResource({}, '')).toEqual({});
  });
  it('removes a resource', () => {
    expect(removeResource({ a: ['read'], b: ['read'] }, 'a')).toEqual({ b: ['read'] });
  });
  it('offers the resources not yet on the role, A to Z', () => {
    const free = availableResources({ order: ['read'] });
    expect(free).not.toContain('order');
    expect(free).toEqual([...free].sort((a, b) => a.localeCompare(b)));
    expect(free.length).toBe(RESOURCES.length - 1);
  });
  it('always shows Read on', () => {
    expect(isEnabled([], 'read')).toBe(true);
    expect(isEnabled([], 'create')).toBe(false);
    expect(isEnabled(['create'], 'create')).toBe(true);
    expect(resourceLabel('order-preparation')).toBe('order preparation');
  });
});

describe('role requests', () => {
  it('checks the name like the web', () => {
    expect(validateRoleName('  ')).toBe('empty');
    expect(validateRoleName('x'.repeat(51))).toBe('long');
    expect(validateRoleName('x'.repeat(50))).toBeNull();
  });
  it('builds the bodies of POST and PUT /api/user/role', () => {
    expect(createRoleBody(' Waiter ', { pos: ['read'] })).toEqual({ role: 'Waiter', permissions: '{"pos":"read"}' });
    expect(updateRoleBody({ id: 'r1', role: 'Cashier', permissions: {} }, { pos: ['create', 'read'] })).toEqual({ id: 'r1', role: 'Cashier', permissions: '{"pos":"create,read"}' });
  });
});
