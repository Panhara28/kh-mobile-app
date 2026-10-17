import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, KhPosApi, type StaffUser } from './api';
import { KHPOS_URL } from './config';

const TOKEN_KEY = 'khpos_staff_token';

export type SessionStatus =
  | 'loading' // checking a saved token
  | 'signedOut'
  | 'signedIn'
  | 'unreachable'; // a token is saved but the server couldn't be reached to check it

interface SessionValue {
  status: SessionStatus;
  user: StaffUser | null;
  api: KhPosApi;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  retry(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Staff session: the kh-pos login token is kept in SecureStore (Android Keystore / iOS
 * Keychain) and checked with /api/user/me on start.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const api = useMemo(() => new KhPosApi(KHPOS_URL, () => tokenRef.current), []);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<StaffUser | null>(null);
  const [attempt, setAttempt] = useState(0);

  const signOutLocally = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    setStatus('signedOut');
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }, []);

  // Restore a saved session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!saved) {
        if (!cancelled) setStatus('signedOut');
        return;
      }
      tokenRef.current = saved;
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
        setStatus('signedIn');
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.kind === 'network') setStatus('unreachable');
        else await signOutLocally();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, attempt, signOutLocally]);

  const login = useCallback(
    async (username: string, password: string) => {
      const token = await api.login(username, password);
      tokenRef.current = token;
      try {
        const me = await api.me();
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        setUser(me);
        setStatus('signedIn');
      } catch (e) {
        tokenRef.current = null;
        throw e;
      }
    },
    [api],
  );

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      api,
      login,
      logout: signOutLocally,
      retry: () => {
        setStatus('loading');
        setAttempt((a) => a + 1);
      },
    }),
    [status, user, api, login, signOutLocally],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
