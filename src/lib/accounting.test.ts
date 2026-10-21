import { accountBody, accountForm, bookingBody, bookingQuery, emptyAccount, emptyBooking, isExpense, summaryNumbers, validateAccount, validateBooking } from './accounting';

describe('the chart of accounts', () => {
  it('needs a name and a type', () => {
    expect(validateAccount(emptyAccount())).toBe('accountName');
    expect(validateAccount({ accountName: 'Rent', accountType: '' })).toBe('accountType');
    expect(validateAccount({ accountName: ' Rent ', accountType: 'expense' })).toBeNull();
  });
  it('sends snake_case names and the id when editing', () => {
    expect(accountBody({ accountName: ' Rent ', accountType: 'expense' })).toEqual({ account_name: 'Rent', account_type: 'expense' });
    const row = { id: 'a1', accountName: 'Sales', accountType: 'revenue' as const };
    expect(accountBody(accountForm(row), row)).toEqual({ id: 'a1', account_name: 'Sales', account_type: 'revenue' });
  });
});

describe('bookings', () => {
  it('needs a name, an account and an amount above zero', () => {
    expect(validateBooking(emptyBooking())).toBe('bookingName');
    expect(validateBooking({ bookingName: 'x', accountId: '', amount: 5 })).toBe('accountId');
    expect(validateBooking({ bookingName: 'x', accountId: 'a', amount: 0 })).toBe('amount');
    expect(validateBooking({ bookingName: 'x', accountId: 'a', amount: 5 })).toBeNull();
  });
  it('sends a positive amount; kh-pos makes expenses negative', () => {
    expect(bookingBody({ bookingName: ' Rent ', accountId: 'a', amount: -12.5 })).toEqual({ bookingName: 'Rent', accountId: 'a', amount: 12.5 });
  });
  it('reads the summary, showing expense as a positive number', () => {
    expect(summaryNumbers({ total_amount: '70', total_revenue: '100', total_expense: '-30', total_count: 4 })).toEqual({ revenue: 100, expense: 30, net: 70, count: 4 });
    expect(summaryNumbers(null)).toEqual({ revenue: 0, expense: 0, net: 0, count: 0 });
  });
  it('builds the list query and spots expenses', () => {
    expect(bookingQuery({ limit: 30, offset: 0 })).toBe('limit=30&offset=0');
    expect(bookingQuery({ limit: 30, offset: 30, range: { start: '2026-10-01 00:00:00', end: '2026-10-31 23:59:59' }, type: 'expense' })).toBe('limit=30&offset=30&startDate=2026-10-01+00%3A00%3A00&endDate=2026-10-31+23%3A59%3A59&accountType=expense');
    expect(isExpense({ amount: -3, account: null })).toBe(true);
    expect(isExpense({ amount: 3, account: { accountType: 'revenue' } })).toBe(false);
  });
});
