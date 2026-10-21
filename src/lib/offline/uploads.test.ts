import { hasDataImage, isDataImage, pictureValue, resolveUploads, splitDataImage, type UploadMemo } from './uploads';

const memory = (): UploadMemo & { saved: Record<string, string> } => {
  const saved: Record<string, string> = {};
  return { saved, get: async (k) => saved[k] ?? null, set: async (k, u) => void (saved[k] = u) };
};

describe('pictures kept inside a change', () => {
  it('makes a data address from a picked picture and takes it apart again', () => {
    const v = pictureValue('QUJD', 'jpg');
    expect(v).toBe('data:image/jpeg;base64,QUJD');
    expect(isDataImage(v)).toBe(true);
    expect(isDataImage('https://x/y.jpg')).toBe(false);
    expect(splitDataImage(v)).toEqual({ extension: 'jpg', base64: 'QUJD' });
    expect(splitDataImage('data:image/png;base64,AAAA')).toEqual({ extension: 'png', base64: 'AAAA' });
  });

  it('uploads each picture found anywhere in a body, once, and leaves everything else as it is', async () => {
    const memo = memory();
    const uploads: string[] = [];
    const upload = async (b64: string, ext: string) => {
      uploads.push(`${b64}.${ext}`);
      return `/files/${b64}.${ext}`;
    };
    const body = { title: 'Tea', imageUrl: pictureValue('AAA'), images: [{ url: pictureValue('BBB') }, { url: '/files/old.jpg' }, { url: pictureValue('AAA') }], n: 3, nothing: null };
    const out = await resolveUploads(body, upload, memo);
    expect(out).toEqual({ title: 'Tea', imageUrl: '/files/AAA.jpg', images: [{ url: '/files/BBB.jpg' }, { url: '/files/old.jpg' }, { url: '/files/AAA.jpg' }], n: 3, nothing: null });
    expect(uploads).toEqual(['AAA.jpg', 'BBB.jpg']); // AAA twice in the body, uploaded once
    // a retry after a lost answer does not upload them again
    await resolveUploads(body, upload, memo);
    expect(uploads).toHaveLength(2);
  });

  it('knows whether a body has a picture', () => {
    expect(hasDataImage({ a: [{ b: pictureValue('x') }] })).toBe(true);
    expect(hasDataImage({ a: [{ b: 'https://x' }], c: 1 })).toBe(false);
  });
});
