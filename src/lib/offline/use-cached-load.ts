import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useOffline } from './provider';

/**
 * Loads something from kh-pos for a screen, keeping a copy for when the server can't be reached
 * (see OfflineData.cachedRead). Reloads when the screen is shown, when `key` changes (a new
 * filter), after changes were sent, and when kh-pos comes back. `fetcher` must be memoised
 * (useCallback) on what the key stands for.
 */
export function useCachedLoad<T>(name: string, key: string, fetcher: () => Promise<T>) {
  const { data, state } = useOffline();
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [staleAt, setStaleAt] = useState<number | null | false>(false);
  const { online, syncVersion } = state;

  const reload = useCallback(async () => {
    try {
      const r = await data.cachedRead(name, key, fetcher);
      setValue(r.data);
      setStaleAt(r.stale ? r.savedAt : false);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [data, name, key, fetcher]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void reload();
      // online and syncVersion are triggers: read again when kh-pos came back or changes were sent
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reload, online, syncVersion]),
  );

  return { value, loading, error, staleAt, reload };
}
