import { checkPassword, fromHex, makeVerifier, MemoryVault, normalizeUsername, OfflineLogin, rememberLogin, toHex, utf8 } from './offline-login';

const ITER = 50; // tests don't need the real cost
const salt = () => Uint8Array.from({ length: 16 }, (_, i) => i + 1);

describe('password verifier', () => {
  it('accepts the right password and rejects others', async () => {
    const v = await makeVerifier('correct horse', salt(), ITER);
    expect(v).toMatchObject({ v: 1, iterations: ITER });
    expect(v.hash).toHaveLength(64);
    expect(await checkPassword('correct horse', v)).toBe(true);
    expect(await checkPassword('correct horsf', v)).toBe(false);
    expect(await checkPassword('', v)).toBe(false);
  });

  it('works with Khmer and emoji passwords', async () => {
    const v = await makeVerifier('ពាក្យសម្ងាត់😀', salt(), ITER);
    expect(await checkPassword('ពាក្យសម្ងាត់😀', v)).toBe(true);
    expect(await checkPassword('ពាក្យសម្ងាត់', v)).toBe(false);
  });

  it('uses the salt: the same password gives different hashes', async () => {
    const a = await makeVerifier('pw', salt(), ITER);
    const b = await makeVerifier('pw', Uint8Array.from({ length: 16 }, () => 9), ITER);
    expect(a.hash).not.toBe(b.hash);
  });

  it('refuses a damaged record instead of throwing', async () => {
    expect(await checkPassword('pw', { v: 1, salt: '', iterations: ITER, hash: '' })).toBe(false);
    expect(await checkPassword('pw', { v: 1, salt: 'ab', iterations: 0, hash: 'cd' })).toBe(false);
  });

  it('encodes UTF-8 and hex correctly', () => {
    expect(toHex(utf8('aé€😀'))).toBe('61c3a9e282acf09f9880');
    expect(Array.from(fromHex('00ff10'))).toEqual([0, 255, 16]);
  });
});

describe('OfflineLogin', () => {
  async function setup() {
    const vault = new MemoryVault();
    let clock = 1_000_000;
    const login = new OfflineLogin(vault, () => clock);
    await rememberLogin(vault, { username: '  Staff1 ', password: 'secret', token: 'tok-1' }, () => salt(), () => clock, ITER);
    return { vault, login, advance: (ms: number) => (clock += ms) };
  }

  it('logs in someone who logged in on this phone before, by any capitalisation of the name', async () => {
    const { login } = await setup();
    expect(await login.verify('STAFF1', 'secret')).toEqual({ ok: true, token: 'tok-1' });
  });

  it('refuses a name this phone has never seen, and a wrong password', async () => {
    const { login } = await setup();
    expect(await login.verify('stranger', 'secret')).toEqual({ ok: false, reason: 'noAccount' });
    expect(await login.verify('staff1', 'nope')).toEqual({ ok: false, reason: 'wrongPassword' });
  });

  it('pauses after five wrong passwords, then allows trying again', async () => {
    const { login, advance } = await setup();
    for (let i = 0; i < 4; i++) expect(await login.verify('staff1', 'bad')).toMatchObject({ reason: 'wrongPassword' });
    expect(await login.verify('staff1', 'bad')).toMatchObject({ ok: false, reason: 'locked' });
    // even the right password waits during the pause
    expect(await login.verify('staff1', 'secret')).toMatchObject({ ok: false, reason: 'locked' });
    advance(61_000);
    expect(await login.verify('staff1', 'secret')).toEqual({ ok: true, token: 'tok-1' });
  });

  it('a right password clears earlier mistakes', async () => {
    const { login } = await setup();
    for (let i = 0; i < 3; i++) await login.verify('staff1', 'bad');
    await login.verify('staff1', 'secret');
    for (let i = 0; i < 4; i++) expect(await login.verify('staff1', 'bad')).toMatchObject({ reason: 'wrongPassword' });
  });

  it('a newer online login replaces the old password and token', async () => {
    const { vault, login } = await setup();
    await rememberLogin(vault, { username: 'staff1', password: 'new-secret', token: 'tok-2' }, () => salt(), Date.now, ITER);
    expect(await login.verify('staff1', 'secret')).toMatchObject({ ok: false });
    expect(await login.verify('staff1', 'new-secret')).toEqual({ ok: true, token: 'tok-2' });
  });

  it('can forget a person (password changed or token rejected)', async () => {
    const { vault, login } = await setup();
    await vault.remove('Staff1');
    expect(await login.verify('staff1', 'secret')).toEqual({ ok: false, reason: 'noAccount' });
  });

  it('keeps the name in one form', () => {
    expect(normalizeUsername('  AbC ')).toBe('abc');
  });
});
