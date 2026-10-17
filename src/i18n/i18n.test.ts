import en from './en.json';
import km from './km.json';

function flatten(obj: object, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v as object, key));
  }
  return out;
}

const placeholders = (s: string) => (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).sort();

describe('translations', () => {
  const enFlat = flatten(en);
  const kmFlat = flatten(km);

  it('en and km have the same keys', () => {
    expect(Object.keys(kmFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('every km string is filled in and keeps the same {{placeholders}}', () => {
    for (const [key, value] of Object.entries(enFlat)) {
      expect({ key, filled: (kmFlat[key] ?? '').trim().length > 0 }).toEqual({ key, filled: true });
      expect({ key, placeholders: placeholders(kmFlat[key] ?? '') }).toEqual({ key, placeholders: placeholders(value) });
    }
  });
});
