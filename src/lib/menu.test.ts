import { cardPrice, initials, menuCategories, splitTitle } from './menu';

describe('menu helpers', () => {
  it('splits "Product (Variant)" titles', () => {
    expect(splitTitle('Iced Latte (Regular)')).toEqual({ name: 'Iced Latte', variant: 'Regular' });
    expect(splitTitle('Fried Rice')).toEqual({ name: 'Fried Rice', variant: null });
    expect(splitTitle('Tea (Hot) (Large)')).toEqual({ name: 'Tea (Hot)', variant: 'Large' });
    expect(splitTitle('Soup ()')).toEqual({ name: 'Soup', variant: null });
  });

  it('shows the discounted price with the original struck through', () => {
    expect(cardPrice({ price: '5.00', discountedPrice: 4 })).toEqual({ price: 4, original: 5 });
    expect(cardPrice({ price: 3, discountedPrice: null })).toEqual({ price: 3, original: null });
    expect(cardPrice({ price: 3, discountedPrice: 3 })).toEqual({ price: 3, original: null });
    expect(cardPrice({ price: undefined })).toEqual({ price: 0, original: null });
  });

  it('hides categories with nothing for sale', () => {
    expect(
      menuCategories([
        { id: 'a', title: 'Drinks', forSaleCount: 3 },
        { id: 'b', title: 'Old', forSaleCount: 0 },
        { id: 'c', title: 'Unknown' },
      ]).map((c) => c.id),
    ).toEqual(['a', 'c']);
  });

  it('makes initials for the image placeholder', () => {
    expect(initials('Beef Lok Lak')).toBe('BL');
    expect(initials('Amok')).toBe('AM');
    expect(initials('  ')).toBe('?');
  });
});
