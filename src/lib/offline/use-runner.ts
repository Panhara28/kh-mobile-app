import * as Crypto from 'expo-crypto';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { errorKind } from '@/ui/states';
import { useSession } from '../session';
import { useOffline } from './provider';
import type { CommandKind, CommandPayload, NewCommand } from './types';

/**
 * For screens that make changes: `command` builds an outbox command for the signed-in staff
 * member, and `submit` does it now when kh-pos can be reached or keeps it for later (see
 * engine.run), showing kh-pos' refusal if there is one. Resolves 'done', 'queued', or null on error.
 */
export function useRunner() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { engine } = useOffline();
  const [busy, setBusy] = useState(false);
  const userId = user?.id ?? '';

  const command = useCallback(
    <K extends CommandKind>(kind: K, payload: CommandPayload[K], tableId = ''): NewCommand<K> => ({
      id: Crypto.randomUUID(),
      userId,
      kind,
      tableId,
      payload,
      createdAt: Date.now(),
    }),
    [userId],
  );

  const submit = useCallback(
    async (cmd: NewCommand, online: () => Promise<void>): Promise<'done' | 'queued' | null> => {
      setBusy(true);
      try {
        return await engine.run(cmd, online);
      } catch (e) {
        Alert.alert(t(`errors.${errorKind(e)}`), e instanceof Error && e.message !== errorKind(e) ? e.message : undefined);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [engine, t],
  );

  return { command, submit, busy };
}
