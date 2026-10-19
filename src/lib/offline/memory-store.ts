import type { CachedValue, LocalStore, NewCommand, OutboxCommand } from './types';

/** In-memory LocalStore for tests (the app uses SQLite, see sqlite-store.ts). */
export class MemoryStore implements LocalStore {
  private cache = new Map<string, CachedValue<unknown>>();
  private outbox: OutboxCommand[] = [];
  private nextSeq = 1;

  constructor(private readonly now: () => number = Date.now) {}

  async getCache<T>(key: string): Promise<CachedValue<T> | null> {
    const hit = this.cache.get(key);
    return hit ? (JSON.parse(JSON.stringify(hit)) as CachedValue<T>) : null;
  }

  async setCache(key: string, value: unknown): Promise<void> {
    this.cache.set(key, { value: JSON.parse(JSON.stringify(value)), savedAt: this.now() });
  }

  async deleteCache(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async outboxAdd(cmd: NewCommand): Promise<void> {
    if (this.outbox.some((c) => c.id === cmd.id)) return; // same command twice: keep the first
    this.outbox.push({ ...JSON.parse(JSON.stringify(cmd)), status: 'pending', error: null, attempts: 0, seq: this.nextSeq++ });
  }

  async outboxList(): Promise<OutboxCommand[]> {
    return JSON.parse(JSON.stringify(this.outbox)) as OutboxCommand[];
  }

  async outboxUpdate(id: string, patch: Partial<Pick<OutboxCommand, 'status' | 'error' | 'attempts' | 'payload'>>): Promise<void> {
    const c = this.outbox.find((x) => x.id === id);
    if (c) Object.assign(c, JSON.parse(JSON.stringify(patch)));
  }

  async outboxRemove(id: string): Promise<void> {
    this.outbox = this.outbox.filter((c) => c.id !== id);
  }
}
