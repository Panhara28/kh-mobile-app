import { createSecretBox, type KeyStore } from './secret';

const memoryKeys = (): KeyStore & { saved: Uint8Array | null } => {
  const k = { saved: null as Uint8Array | null, get: async () => k.saved, set: async (key: Uint8Array) => void (k.saved = key) };
  return k;
};
const random = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

describe('sealed secrets', () => {
  it('opens what it sealed, and the sealed text shows nothing of the original', async () => {
    const box = createSecretBox(memoryKeys(), random);
    const sealed = await box.seal(JSON.stringify({ newPassword: 'Sup3r-secret' }));
    expect(sealed.startsWith('enc1:')).toBe(true);
    expect(sealed).not.toContain('Sup3r');
    expect(JSON.parse(await box.open(sealed))).toEqual({ newPassword: 'Sup3r-secret' });
  });

  it('makes a new key once, keeps it in the key store, and a second box with the same store opens the first one\'s text', async () => {
    const keys = memoryKeys();
    const sealed = await createSecretBox(keys, random).seal('hello');
    expect(keys.saved).toHaveLength(32);
    expect(await createSecretBox(keys, random).open(sealed)).toBe('hello');
  });

  it('seals the same text differently each time', async () => {
    const box = createSecretBox(memoryKeys(), random);
    expect(await box.seal('same')).not.toBe(await box.seal('same'));
  });

  it('refuses a changed value and a value sealed with another key', async () => {
    const box = createSecretBox(memoryKeys(), random);
    const sealed = await box.seal('hello');
    const flipped = `${sealed.slice(0, -2)}${sealed.endsWith('00') ? '11' : '00'}`;
    await expect(box.open(flipped)).rejects.toThrow(/can no longer be read/);
    await expect(createSecretBox(memoryKeys(), random).open(sealed)).rejects.toThrow(/can no longer be read/);
    await expect(box.open('plain text')).rejects.toThrow(/Not a sealed value/);
  });
});
