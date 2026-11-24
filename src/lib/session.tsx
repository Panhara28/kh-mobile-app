import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, KhPosApi, type StaffUser } from './api';
import { KHPOS_URL } from './config';
import { loadDevice } from './device';
import { getStore } from './offline/store';
import { normalizeUsername, OfflineLogin, rememberLogin } from './offline-login';
import { SecureStoreVault } from './secure-vault';

const TOKEN_KEY = 'khpos_staff_token';
/** The signed-in staff member, saved on the phone so the app can open with no connection. */
const USER_KEY = 'session-user';
const RECHECK_MS = 15_000;

/** Offline login (see offline-login.ts): what this phone remembers of staff who logged in with a connection. */
const vault = new SecureStoreVault();
const offlineLogin = new OfflineLogin(vault);
const profileKey = (username: string) => `profile:${normalizeUsername(username)}`;

async function saveProfile(me: StaffUser): Promise<void> {
  try {
    await (await getStore()).setCache(profileKey(me.username), me);
  } catch {
    // only needed for logging in offline
  }
}

/** Forgets a staff member's offline login on this phone (their password changed or kh-pos rejected their token). */
async function forgetOfflineLogin(username: string): Promise<void> {
  try {
    await vault.remove(username);
    await (await getStore()).deleteCache(profileKey(username));
  } catch {
    // ignore
  }
}

export type SessionStatus =
  | 'loading' // checking a saved token
  | 'signedOut'
  | 'signedIn'
  | 'unreachable'; // a token is saved but the server couldn't be reached to check it (and no saved profile)

interface SessionValue {
  status: SessionStatus;
  user: StaffUser | null;
  api: KhPosApi;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /**
   * Clears everything this phone keeps for kh-pos (saved copies, changes not sent yet, offline logins, the login
   * token) and signs out, so the next login starts fresh from kh-pos like the web. The device id, printer and
   * language stay.
   */
  wipePhone(): Promise<void>;
  retry(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Staff session: the kh-pos login token is kept in SecureStore (Android Keystore / iOS
 * Keychain) and checked with /api/user/me on start. If kh-pos can't be reached at that moment,
 * the app opens with the staff profile saved last time (so ordering works offline) and checks the
 * token again in the background; a token kh-pos no longer accepts signs the staff member out then.
 *
 * Logging in needs kh-pos to check the password, except on a phone where that staff member
 * already logged in with a connection: then the password is checked against a salted hash the
 * phone kept (offline-login.ts) and the kh-pos token saved with it is used.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const tokenRef = useRef<string | null>(null);
  const api = useMemo(() => new KhPosApi(KHPOS_URL, () => tokenRef.current), []);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<StaffUser | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Signed in from the saved profile; the token still has to be confirmed by kh-pos. */
  const [unverified, setUnverified] = useState(false);

  const saveUser = useCallback(async (me: StaffUser) => {
    try {
      await (await getStore()).setCache(USER_KEY, me);
    } catch {
      // the saved profile is only for offline starts
    }
    await saveProfile(me);
  }, []);

  const signOutLocally = useCallback(async () => {
    tokenRef.current = null;
    setUser(null);
    setUnverified(false);
    setStatus('signedOut');
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    try {
      await (await getStore()).deleteCache(USER_KEY); // changes waiting to be sent stay on the phone
    } catch {
      // ignore
    }
  }, []);

  // The device id and name go with every request from the start (the web sends them the same way).
  useEffect(() => {
    void loadDevice();
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
        // Server not reachable at all: don't wait for a long timeout, open from the saved profile.
        if (api.baseUrl && !(await api.ping(4_000))) throw new ApiError('network');
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
        setUnverified(false);
        setStatus('signedIn');
        void saveUser(me);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.kind === 'network') {
          const profile = (await (await getStore()).getCache<StaffUser>(USER_KEY).catch(() => null))?.value;
          if (cancelled) return;
          if (profile) {
            setUser(profile);
            setUnverified(true);
            setStatus('signedIn');
          } else {
            setStatus('unreachable');
          }
        } else {
          await signOutLocally();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, attempt, signOutLocally, saveUser]);

  // Opened offline: confirm the token as soon as kh-pos can be reached.
  const username = user?.username ?? null;
  useEffect(() => {
    if (!unverified) return;
    const h = setInterval(() => {
      api.me().then(
        (me) => {
          setUser(me);
          setUnverified(false);
          void saveUser(me);
        },
        (e) => {
          if (e instanceof ApiError && e.kind === 'unauthorized') {
            if (username) void forgetOfflineLogin(username); // the saved token is no good any more
            void signOutLocally();
          }
        },
      );
    }, RECHECK_MS);
    return () => clearInterval(h);
  }, [unverified, api, saveUser, signOutLocally, username]);

  /** Server unreachable: check the password against what this phone remembered. */
  const loginOffline = useCallback(
    async (name: string, password: string) => {
      const result = await offlineLogin.verify(name, password);
      if (!result.ok) {
        throw new ApiError(result.reason === 'noAccount' ? 'offlineNoAccount' : result.reason === 'locked' ? 'locked' : 'invalidCredentials');
      }
      const profile = (await (await getStore()).getCache<StaffUser>(profileKey(name)).catch(() => null))?.value;
      if (!profile) throw new ApiError('offlineNoAccount');
      tokenRef.current = result.token;
      await SecureStore.setItemAsync(TOKEN_KEY, result.token);
      setUser(profile);
      setUnverified(true); // kh-pos confirms the token once it can be reached
      setStatus('signedIn');
      void saveUser(profile);
    },
    [saveUser],
  );

  const login = useCallback(
    async (typedName: string, password: string) => {
      const name = normalizeUsername(typedName);
      // No answer from the server within a few seconds: use the offline check instead of waiting.
      if (api.baseUrl && !(await api.ping(4_000))) return loginOffline(name, password);

      let token: string;
      try {
        token = await api.login(typedName, password);
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'network') return loginOffline(name, password);
        // The server says no: a password changed on the server must not keep working offline.
        if (e instanceof ApiError && e.kind === 'invalidCredentials') await forgetOfflineLogin(name);
        throw e;
      }
      tokenRef.current = token;
      try {
        const me = await api.me();
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        setUser(me);
        setUnverified(false);
        setStatus('signedIn');
        void saveUser(me);
        // Remember this login for offline use. Slow by design, so it runs after the screen has moved on.
        void rememberLogin(vault, { username: name, password, token }, (n) => Crypto.getRandomBytes(n)).catch(() => undefined);
      } catch (e) {
        tokenRef.current = null;
        throw e;
      }
    },
    [api, saveUser, loginOffline],
  );

  const wipePhone = useCallback(async () => {
    const store = await getStore();
    // the offline logins are in secure storage, one per staff member who signed in on this phone
    for (const key of await store.cacheKeys('profile:')) await vault.remove(key.slice('profile:'.length)).catch(() => undefined);
    await store.clearAll();
    await signOutLocally();
  }, [signOutLocally]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      api,
      login,
      logout: signOutLocally,
      wipePhone,
      retry: () => {
        setStatus('loading');
        setAttempt((a) => a + 1);
      },
    }),
    [status, user, api, login, signOutLocally, wipePhone],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}
