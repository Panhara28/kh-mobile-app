import { customerBody, emptyCustomer, orderTypeBody, phoneQuery, servedTypeOf, validateCustomer } from './customers';

describe('customers', () => {
  it('needs a name and a phone number', () => {
    const f = { ...emptyCustomer(), customerName: 'Sok', phone: '012 345 678' };
    expect(validateCustomer(f)).toBeNull();
    expect(validateCustomer({ ...f, customerName: ' ' })).toBe('customerName');
    expect(validateCustomer({ ...f, phone: '12' })).toBe('phone');
    expect(validateCustomer({ ...f, extraPrice: -1 })).toBe('extraPrice');
  });

  it('trims what is saved and defaults to a delivery customer', () => {
    expect(customerBody({ ...emptyCustomer(), customerName: ' Sok ', phone: ' 012 ', address: ' PP ', extraPrice: 0.5 })).toEqual({ customerName: 'Sok', phone: '012', address: 'PP', type: 'delivery', extraPrice: 0.5 });
    expect(customerBody({ ...emptyCustomer(), type: 'general', extraPrice: -3 }).extraPrice).toBe(0);
  });

  it('builds the order type change', () => {
    const delivery = { id: 'c9', customerName: 'Sok', phone: '012' };
    expect(orderTypeBody('dine_in', 'walkin', null)).toEqual({ customerId: 'walkin', code: '', type: 'dine_in' });
    expect(orderTypeBody('take_away', 'walkin', delivery)).toEqual({ customerId: 'walkin', code: '', type: 'take_away' });
    expect(orderTypeBody('food_delivery', 'walkin', delivery)).toEqual({ customerId: 'c9', code: '', type: 'food_delivery' });
    expect(orderTypeBody('food_delivery', 'walkin', null)).toBeNull(); // a delivery needs a customer
    expect(orderTypeBody('dine_in', '', null)).toBeNull();
  });

  it('reads the order type and the phone box', () => {
    expect(servedTypeOf('take_away')).toBe('take_away');
    expect(servedTypeOf('customer')).toBe('dine_in');
    expect(servedTypeOf(undefined)).toBe('dine_in');
    expect(phoneQuery('012 345-678')).toBe('012345678');
  });
});
