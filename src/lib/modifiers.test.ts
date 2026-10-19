import { addOption, boundProducts, canRemoveOption, cleanPrice, emptyModifierForm, filterBound, matchesModifier, modifierFormOf, modifierProblem, modifierSaveBody, patchOption, removeOption, summary, type ModifierItem } from './modifiers';

const m: ModifierItem = { modifierId: 'm1', title: 'Pizza extras', description: 'Toppings', items: [{ id: 'i1', name: 'Extra cheese', price: '0.5' }, { id: 'i2', name: 'Large', price: 1 }] };
let k = 0;
const id = () => `new${++k}`;

describe('the modifier form', () => {
  it('is filled from a modifier with numeric prices', () => {
    expect(modifierFormOf(m)).toEqual({ title: 'Pizza extras', description: 'Toppings', items: [{ id: 'i1', name: 'Extra cheese', price: 0.5 }, { id: 'i2', name: 'Large', price: 1 }] });
  });
  it('adds options, edits them, and only removes while more than one remains', () => {
    let f = addOption(emptyModifierForm());
    expect(f.items).toEqual([{ id: '', name: '', price: 0 }]);
    expect(canRemoveOption(f)).toBe(false);
    expect(removeOption(f, 0)).toBe(f);
    f = patchOption(addOption(f), 1, { name: 'Egg', price: 2 });
    expect(canRemoveOption(f)).toBe(true);
    expect(removeOption(f, 0).items).toEqual([{ id: '', name: 'Egg', price: 2 }]);
  });
  it('never takes a negative or broken price', () => {
    expect([cleanPrice(-1), cleanPrice(null), cleanPrice(NaN), cleanPrice(0.25)]).toEqual([0, 0, 0, 0.25]);
  });
  it('counts options and the most they add together', () => {
    expect(summary(modifierFormOf(m))).toEqual({ count: 2, total: 1.5 });
    expect(summary(emptyModifierForm())).toEqual({ count: 0, total: 0 });
  });
});

describe('checking before saving', () => {
  it('needs a title, an option, and every option named', () => {
    expect(modifierProblem(emptyModifierForm())).toBe('title');
    expect(modifierProblem({ ...emptyModifierForm(), title: 'T' })).toBe('noOptions');
    expect(modifierProblem({ title: 'T', description: '', items: [{ id: '', name: ' ', price: 0 }] })).toBe('optionName');
    expect(modifierProblem(modifierFormOf(m))).toBeNull();
  });
});

describe('the request body', () => {
  it('sends an id for every option (kh-pos drops options without one when updating)', () => {
    k = 0;
    const f = { ...modifierFormOf(m), items: [...modifierFormOf(m).items, { id: '', name: ' Egg ', price: -3 }] };
    expect(modifierSaveBody(f, id, m)).toEqual({
      id: 'm1',
      title: 'Pizza extras',
      description: 'Toppings',
      items: [{ id: 'i1', name: 'Extra cheese', price: 0.5 }, { id: 'i2', name: 'Large', price: 1 }, { id: 'new1', name: 'Egg', price: 0 }],
    });
  });
  it('a new modifier has no id', () => {
    k = 0;
    const body = modifierSaveBody({ title: ' T ', description: '', items: [{ id: '', name: 'A', price: 1 }] }, id);
    expect('id' in body).toBe(false);
    expect(body.title).toBe('T');
    expect(body.items).toEqual([{ id: 'new1', name: 'A', price: 1 }]);
  });
});

describe('list and applied products', () => {
  it('searches title, description and option names', () => {
    expect(matchesModifier(m, 'pizza')).toBe(true);
    expect(matchesModifier(m, 'topping')).toBe(true);
    expect(matchesModifier(m, 'cheese')).toBe(true);
    expect(matchesModifier(m, 'nope')).toBe(false);
    expect(matchesModifier(m, ' ')).toBe(true);
  });
  it('lists applied products without deleted ones, sorted, and filters by every word', () => {
    const rows = [
      { product_id: 'b', product: { title: 'Burger' }, variants: [{ id: 'v', name: 'Large', price: 3 }] },
      { product_id: 'a', product: { title: 'Apple pie' }, variants: [] },
      { product_id: 'x', product: { title: 'Gone', deletedAt: '2026-01-01' } },
      { product_id: 'y', product: null },
    ];
    const list = boundProducts(rows);
    expect(list.map((r) => r.product_id)).toEqual(['a', 'b']);
    expect(filterBound(list, 'burger large').map((r) => r.product_id)).toEqual(['b']);
    expect(filterBound(list, 'burger pie')).toEqual([]);
    expect(filterBound(list, '')).toBe(list);
  });
});
