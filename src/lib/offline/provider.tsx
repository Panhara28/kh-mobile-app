import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Image } from 'react-native';
import { useSession } from '../session';
import { OfflineData } from './data';
import { SyncEngine, type EngineState } from './engine';
import { getStore } from './store';
import type { LocalStore } from './types';

interface OfflineValue {
  data: OfflineData;
  engine: SyncEngine;
  state: EngineState;
  store: LocalStore;
  /** "Sync now": checks for kh-pos, sends what is waiting and refreshes the saved menu and tables. */
  syncNow(): Promise<void>;
}

const OfflineContext = createContext<OfflineValue | null>(null);

const noopSubscribe = () => () => undefined;
const EMPTY: EngineState = { online: true, syncing: false, commands: [], pending: 0, failed: 0, lastSyncedAt: null, syncVersion: 0 };
const getEmpty = () => EMPTY;
const WARM_EVERY_MS = 10 * 60_000;

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
    data.onMenuSaved = (menu) => {
      for (const p of menu) {
        const url = api.imageUrl(p.images?.[0]?.url);
        if (url) void Image.prefetch(url).catch(() => undefined);
      }
    };
    return () => {
      data.onMenuSaved = null;
    };
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

  // Keep a copy of the menu, tables and settings for offline use; refresh when kh-pos is back.
  const online = state.online;
  useEffect(() => {
    if (!data || !uid || !wh || !online) return;
    data.resetDown();
    void data.warm(wh);
    const h = setInterval(() => void data.warm(wh), WARM_EVERY_MS);
    return () => clearInterval(h);
  }, [data, uid, wh, online]);

  // Coming back to the app: look for kh-pos straight away.
  useEffect(() => {
    if (!engine || !data || !uid) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      data.resetDown();
      void engine.tick().then(() => (engine.getState().online && wh ? data.warm(wh) : undefined));
    });
    return () => sub.remove();
  }, [engine, data, uid, wh]);

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
    () => (engine && data && store ? { data, engine, state, store, syncNow } : null),
    [engine, data, store, state, syncNow],
  );
  if (!value) return null; // the phone's database is opening (a moment)
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  const v = useContext(OfflineContext);
  if (!v) throw new Error('useOffline must be used inside OfflineProvider');
  return v;
}
