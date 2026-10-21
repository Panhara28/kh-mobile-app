import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Image } from 'react-native';
import { useSession } from '../session';
import { OfflineData } from './data';
import { SyncEngine, type EngineState } from './engine';
import { warmModules } from './warm-modules';
import { getStore } from './store';
import type { LocalStore } from './types';

interface OfflineValue {
  data: OfflineData;
  engine: SyncEngine;
  state: EngineState;
  store: LocalStore;
  /** "Sync now": checks for kh-pos, sends what is waiting and refreshes the saved menu and tables. */
  syncNow(): Promise<void>;
  /** The background saving of every module (see warm-modules.ts). */
  moduleSync: ModuleSync;
}

export interface ModuleSync {
  running: boolean;
  done: number;
  total: number;
  /** When the last complete pass ended (ms since epoch), or null if none yet on this phone. */
  finishedAt: number | null;
  /** What the last pass could not save, and why (at most a few dozen). */
  problems: { address: string; reason: string }[];
}

const NO_MODULE_SYNC: ModuleSync = { running: false, done: 0, total: 0, finishedAt: null, problems: [] };

const OfflineContext = createContext<OfflineValue | null>(null);

const noopSubscribe = () => () => undefined;
const EMPTY: EngineState = { online: true, syncing: false, commands: [], pending: 0, failed: 0, lastSyncedAt: null, syncVersion: 0 };
const getEmpty = () => EMPTY;
const WARM_EVERY_MS = 10 * 60_000;
/** Longest answer kept by address (characters of JSON). */
const MAX_SAVED_ANSWER = 8_000_000;

/**
 * Offline support for the signed-in staff member (see offline/types.ts): opens the phone's
 * database, creates the data cache and the sync engine, and keeps them going: a check for kh-pos
 * every few seconds while something is waiting or it's unreachable, a fresh copy of the menu,
 * tables and settings when the app starts, returns to the foreground or reconnects.
 */
export function OfflineProvider({ children }: { children: ReactNode }) {
  const { api, user } = useSession();
  const [store, setStore] = useState<LocalStore | null>(null);
  const uid = user?.id ?? null;
  const wh = user?.currentWarehouseId ?? '';

  useEffect(() => {
    let alive = true;
    void getStore().then((s) => alive && setStore(s));
    return () => {
      alive = false;
    };
  }, []);

  const engine = useMemo(() => (store ? new SyncEngine(api, store) : null), [api, store]);
  // Created with the branch already known: screens read through it before this component's effects run.
  const data = useMemo(
    () => (store && engine ? new OfflineData(api, store, wh, (online) => engine.setOnline(online)) : null),
    [api, store, engine, wh],
  );
  // Product photos are asked for once while kh-pos is reachable so the phone's image cache has them offline (best effort).
  useEffect(() => {
    if (!data) return;
    data.setOnMenuSaved((menu) => {
      for (const p of menu) {
        const url = api.imageUrl(p.images?.[0]?.url);
        if (url) void Image.prefetch(url).catch(() => undefined);
      }
    });
    return () => data.setOnMenuSaved(null);
  }, [data, api]);
  const state = useSyncExternalStore(engine?.subscribe ?? noopSubscribe, engine?.getState ?? getEmpty);

  // Check for kh-pos and send waiting changes while signed in.
  useEffect(() => {
    if (!engine || !data || !uid) return;
    engine.setUser(uid);
    void engine.refresh();
    engine.start();
    return () => {
      engine.stop();
      engine.setUser(null);
    };
  }, [engine, data, uid, wh]);

  const [problems, setProblems] = useState<ModuleSync['problems']>([]);
  const noteProblem = useCallback((address: string, reason: string) => {
    setProblems((list) => (list.length >= 40 || list.some((p) => p.address === address) ? list : [...list, { address, reason }]));
  }, []);

  // Every answer to a GET is kept on the phone by address, so a screen can be rebuilt from them when kh-pos can't be reached.
  useEffect(() => {
    if (!store || !uid) return;
    const key = (path: string) => `url:${uid}:${wh}:${path}`;
    api.setUrlCache({
      save: (path, value) => {
        try {
          const size = JSON.stringify(value).length;
          if (size > MAX_SAVED_ANSWER) {
            // a huge answer (a 10 000 order summary) is not kept; say so in the sync sheet
            noteProblem(path, `too big to keep (${Math.round(size / 1024)} KB)`);
            return;
          }
          void store.setCache(key(path), value).catch(() => undefined);
        } catch {
          // best effort
        }
      },
      load: async (path) => {
        const c = await store.getCache<unknown>(key(path)).catch(() => null);
        return c ? { value: c.value, savedAt: c.savedAt } : null;
      },
    });
    return () => api.setUrlCache(null);
  }, [api, store, uid, wh, noteProblem]);

  // Keep the modules in step in the background (see warm-modules.ts), one pass at a time.
  const modulesBusy = useRef(false);
  const isMain = !!user?.warehouse?.isMain;
  const [moduleSync, setModuleSync] = useState<ModuleSync>(NO_MODULE_SYNC);
  const doneKey = `modulesync:${uid}:${wh}`;
  // when the last complete pass ended, kept so it is still known after the app is closed
  useEffect(() => {
    if (!store || !uid) return;
    let alive = true;
    void store.getCache<number>(doneKey).then((c) => alive && setModuleSync((m) => ({ ...m, finishedAt: c?.value ?? null })));
    return () => {
      alive = false;
    };
  }, [store, uid, doneKey]);
  const syncModules = useCallback(async () => {
    if (!uid || !wh || modulesBusy.current) return;
    modulesBusy.current = true;
    setProblems([]);
    setModuleSync((m) => ({ ...m, running: true, done: 0, total: 0 }));
    try {
      const complete = await warmModules(
        api,
        { userId: uid, warehouseId: wh, isMain },
        () => engine?.getState().online ?? false,
        // not every request: the screen would redraw hundreds of times
        (p) => (p.done % 5 === 0 || p.done >= p.total) && setModuleSync((m) => ({ ...m, running: true, done: p.done, total: p.total })),
        (address, reason) => noteProblem(address, reason),
      );
      if (complete) {
        const finishedAt = Date.now();
        void store?.setCache(doneKey, finishedAt).catch(() => undefined);
        setModuleSync((m) => ({ ...m, finishedAt }));
      }
    } finally {
      modulesBusy.current = false;
      setModuleSync((m) => ({ ...m, running: false }));
    }
  }, [api, engine, store, uid, wh, isMain, doneKey, noteProblem]);

  // Keep a copy of the menu, tables and settings for offline use; refresh when kh-pos is back.
  const online = state.online;
  useEffect(() => {
    if (!data || !uid || !wh || !online) return;
    data.resetDown();
    void data.warm(wh).then(() => syncModules());
    const h = setInterval(() => void data.warm(wh).then(() => syncModules()), WARM_EVERY_MS);
    return () => clearInterval(h);
  }, [data, uid, wh, online, syncModules]);

  // Coming back to the app: look for kh-pos straight away.
  useEffect(() => {
    if (!engine || !data || !uid) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      data.resetDown();
      void engine.tick().then(() => (engine.getState().online && wh ? data.warm(wh).then(() => syncModules()) : undefined));
    });
    return () => sub.remove();
  }, [engine, data, uid, wh, syncModules]);

  const syncNow = useCallback(async () => {
    if (!engine || !data) return;
    data.resetDown();
    const ok = await api.ping();
    engine.setOnline(ok);
    if (ok) {
      await engine.flush();
      if (wh) await data.refreshMenu(wh, true);
      await data.warm(wh);
    }
  }, [api, engine, data, wh]);

  const value = useMemo<OfflineValue | null>(
    () => (engine && data && store ? { data, engine, state, store, syncNow, moduleSync: { ...moduleSync, problems } } : null),
    [engine, data, store, state, syncNow, moduleSync, problems],
  );
  if (!value) return null; // the phone's database is opening (a moment)
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  const v = useContext(OfflineContext);
  if (!v) throw new Error('useOffline must be used inside OfflineProvider');
  return v;
}
