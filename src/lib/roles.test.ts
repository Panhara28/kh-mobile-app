import { countGranted, parsePermissions, RESOURCES, roleBody, serializePermissions, setAll, toggleAction, validateRole } from './roles';

describe('reading and writing permissions', () => {
  it('reads kh-pos format, ignoring junk', () => {
    expect(parsePermissions('{"order":"read,create","shift":"update,bogus","x":""}')).toEqual({ order: ['read', 'create'], shift: ['update'] });
    expect(parsePermissions('{"order":["delete","read"]}')).toEqual({ order: ['read', 'delete'] });
    expect(parsePermissions('not json')).toEqual({});
    expect(parsePermissions(null)).toEqual({});
  });
  it('writes it back the way the web page does, leaving out empty resources', () => {
    expect(serializePermissions({ order: ['delete', 'read'], shift: [] })).toBe('{"order":"read,delete"}');
    expect(parsePermissions(serializePermissions({ order: ['read', 'create', 'update', 'delete'] }))).toEqual({ order: ['read', 'create', 'update', 'delete'] });
  });
});

describe('editing', () => {
  it('turning on a write action also turns on read; turning off read clears the resource', () => {
    expect(toggleAction({}, 'order', 'update', true).order).toEqual(['read', 'update']);
    expect(toggleAction({ order: ['read', 'update'] }, 'order', 'update', false).order).toEqual(['read']);
    expect(toggleAction({ order: ['read', 'update'] }, 'order', 'read', false).order).toEqual([]);
  });
  it('sets everything at once and counts what is granted', () => {
    const p = setAll({}, 'order', true);
    expect(p.order).toEqual(['read', 'create', 'update', 'delete']);
    expect(countGranted({ ...p, shift: [] })).toBe(1);
  });
  it('checks the role before saving', () => {
    const p = { order: ['read' as const] };
    expect(validateRole(' ', p)).toBe('name');
    expect(validateRole('x'.repeat(51), p)).toBe('long');
    expect(validateRole('Cashier', {})).toBe('none');
    expect(validateRole('Cashier', p)).toBeNull();
    expect(roleBody(' Cashier ', p, 'r1')).toEqual({ id: 'r1', role: 'Cashier', permissions: '{"order":"read"}' });
  });
  it('lists each resource once', () => {
    expect(new Set(RESOURCES).size).toBe(RESOURCES.length);
  });
});
