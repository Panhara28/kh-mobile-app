import { priceRange } from './products';

describe('the product list', () => {
  it('shows a price range', () => {
    expect(priceRange([{ price: 2 }, { price: 5.5 }, { price: null }])).toEqual({ min: 0, max: 5.5 });
    expect(priceRange([{ price: 3 }])).toEqual({ min: 3, max: 3 });
    expect(priceRange([])).toBeNull();
    expect(priceRange(undefined)).toBeNull();
  });
});
