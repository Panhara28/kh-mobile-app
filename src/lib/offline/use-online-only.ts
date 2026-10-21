import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { useOffline } from './provider';

/**
 * For actions that can't wait for the server (they need kh-pos' current state, or move money or
 * stock): `guard(action)` runs the action when kh-pos is reachable and otherwise says so.
 */
export function useOnlineOnly() {
  const { t } = useTranslation();
  const { engine } = useOffline();
  return useCallback(
    <T>(action: () => T): T | undefined => {
      if (!engine.getState().online) {
        Alert.alert(t('offline.needsConnection'));
        return undefined;
      }
      return action();
    },
    [engine, t],
  );
}
