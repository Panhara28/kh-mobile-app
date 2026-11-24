import { addToCart, cartCount, cartTotal, matchBarcode, retailOrderBody, setQty, type RetailProduct } from './retail';

const rice: RetailProduct = { variantId: 'v1', productId: 'p1', name: 'Rice', price: 1.25, barcode: '8851' };
const oil: RetailProduct = { variantId: 'v2', productId: 'p2', name: 'Oil', price: 4, barcode: '' };
let k = 0;
const id = () => `l${++k}`;

describe('the retail cart', () => {
  it('adds a product once, then one more each time', () => {
    k = 0;
    let cart = addToCart([], rice, id);
    cart = addToCart(cart, oil, id, 2);
    cart = addToCart(cart, rice, id);
    expect(cart).toEqual([{ ...rice, lineId: 'l1', qty: 2 }, { ...oil, lineId: 'l2', qty: 2 }]);
  });
  it('sets a quantity and drops a line at zero', () => {
    const cart = addToCart(addToCart([], rice, id), oil, id);
    expect(setQty(cart, 'v1', 5)[0]!.qty).toBe(5);
    expect(setQty(cart, 'v1', 0).map((l) => l.variantId)).toEqual(['v2']);
  });
  it('totals without floating point drift', () => {
    const cart = [{ ...rice, lineId: 'a', qty: 3 }, { ...oil, lineId: 'b', qty: 2 }];
    expect(cartTotal(cart)).toBe(11.75);
    expect(cartCount(cart)).toBe(5);
    expect(cartTotal([{ ...rice, price: 0.1, lineId: 'a', qty: 3 }])).toBe(0.3);
  });
});

describe('scanning', () => {
  it('finds a product by its exact barcode', () => {
    expect(matchBarcode([rice, oil], ' 8851 ')).toBe(rice);
    expect(matchBarcode([rice, oil], '885')).toBeNull();
    expect(matchBarcode([rice, oil], '')).toBeNull();
    expect(matchBarcode([oil], '')).toBeNull();
  });
});

describe('opening the order', () => {
  it('has no table and sends prices as text', () => {
    const body = retailOrderBody({ warehouseId: 'w', slotId: 's', customerId: 'c', invoiceNo: 7 }, [{ ...rice, lineId: 'a', qty: 2 }]);
    expect(body).toEqual({ warehouseId: 'w', slotId: 's', customerId: 'c', invoiceNo: 7, items: [{ id: 'a', variantId: 'v1', qty: 2, price: '1.25' }] });
    expect('tableNumber' in body).toBe(false);
  });
});

describe('retail discount', () => {
  const { retailDiscount } = jest.requireActual('./retail') as typeof import('./retail');
  const cart = [
    { variantId: 'a', productId: 'p', name: 'Rice', price: 2.5, barcode: '', lineId: 'l1', qty: 2 },
    { variantId: 'b', productId: 'p', name: 'Tea', price: 1, barcode: '', lineId: 'l2', qty: 1 },
  ];
  it('no discount: the cart total', () => {
    expect(retailDiscount(cart, null)).toEqual({ rows: [], off: 0, total: 6 });
  });
  it('a percentage goes on every line', () => {
    const r = retailDiscount(cart, { type: 'PERCENTAGE', value: 10 });
    expect(r.rows).toEqual([
      { lineId: 'l1', amount: 10, discountType: 'PERCENTAGE' },
      { lineId: 'l2', amount: 10, discountType: 'PERCENTAGE' },
    ]);
    expect(r.off).toBe(0.6);
    expect(r.total).toBe(5.4);
  });
  it('an amount is shared by price', () => {
    const r = retailDiscount(cart, { type: 'AMOUNT', value: 1.2 });
    expect(r.rows[0]!.amount).toBeCloseTo(1);
    expect(r.rows[1]!.amount).toBeCloseTo(0.2);
    expect(r.total).toBe(4.8);
  });
  it('a discount bigger than the sale is ignored', () => {
    expect(retailDiscount(cart, { type: 'AMOUNT', value: 50 }).total).toBe(6);
    expect(retailDiscount(cart, { type: 'PERCENTAGE', value: 120 }).total).toBe(6);
  });
});
