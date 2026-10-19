import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { fetchAllPages } from '@/lib/catalog';
import { useSession } from '@/lib/session';
import { addBinding, availableBranches, initialBindEntries, removeBinding, type BindEntry } from '@/lib/users';
import { Badge, Button, Chip } from '@/ui/components';
import { colors, font, space } from '@/ui/theme';

interface Branch {
  id: string;
  name: string;
}

/**
 * "Bind Users" of the web edit form: the branches this person can also sign in from. Adding a branch
 * makes them an account there (same name, phone and role); removing one takes it away on Save.
 */
export function BindUsers({ userId, warehouseId, onChange }: { userId: string; warehouseId: string; onChange: (entries: BindEntry[], group: number) => void }) {
  const { t } = useTranslation();
  const { api } = useSession();
  const [entries, setEntries] = useState<BindEntry[] | null>(null);
  const [group, setGroup] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [g, list, all] = await Promise.all([
          api.call<{ result?: number }>('GET', `/api/user/bind-user/group?userId=${encodeURIComponent(userId)}`),
          api.call<{ result?: Parameters<typeof initialBindEntries>[0] }>('GET', `/api/user/bind-user?userId=${encodeURIComponent(userId)}`),
          fetchAllPages<Branch>(async (o, l) => (await api.call<{ result: { data: Branch[]; total: number } }>('GET', `/api/warehouse?limit=${Math.min(l, 100)}&offset=${o}`)).result),
        ]);
        if (!live) return;
        const grp = g.result ?? 1;
        const initial = initialBindEntries(list.result ?? [], grp, userId, warehouseId);
        setGroup(grp);
        setBranches(all);
        setEntries(initial);
        onChange(initial, grp);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
    // loads once for this user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const name = (id: string) => branches.find((b) => b.id === id)?.name ?? id;
  const update = (next: BindEntry[]) => {
    setEntries(next);
    onChange(next, group);
  };

  if (failed) return <Text style={styles.hint}>{t('users.bindFailed')}</Text>;
  if (!entries) return <Text style={styles.hint}>{t('common.loading')}</Text>;
  const free = availableBranches(branches, entries);

  return (
    <View style={styles.box}>
      <View style={styles.head}>
        <Text style={styles.title}>{t('users.bindUsers')}</Text>
        <Badge text={String(entries.length)} tone="outline" />
      </View>
      {entries.length === 0 ? <Text style={styles.hint}>{t('users.noBound')}</Text> : null}
      <View style={styles.chips}>
        {entries.map((e) => (
          <View key={e.warehouseId} style={styles.entry}>
            <Text style={styles.entryText}>
              {e.isMain ? `${t('users.main')} · ` : ''}
              {name(e.warehouseId)}
              {e.isNew ? ` · ${t('users.new')}` : ''}
            </Text>
            {!e.isMain ? <Button title="✕" variant="ghost" size="sm" onPress={() => update(removeBinding(entries, e.warehouseId))} accessibilityLabel={t('users.removeBranch', { name: name(e.warehouseId) })} /> : null}
          </View>
        ))}
      </View>
      {adding ? (
        <View style={styles.add}>
          <Text style={styles.hint}>{t('users.available')}</Text>
          <View style={styles.chips}>
            {free.map((b) => (
              <Chip key={b.id} label={b.name} selected={pick === b.id} onPress={() => setPick(b.id)} />
            ))}
          </View>
          <View style={styles.chips}>
            <Button
              title={t('common.add')}
              size="sm"
              disabled={!pick}
              onPress={() => {
                update(addBinding(entries, pick, group));
                setPick('');
                setAdding(false);
              }}
            />
            <Button title={t('common.cancel')} variant="ghost" size="sm" onPress={() => { setAdding(false); setPick(''); }} />
          </View>
        </View>
      ) : free.length > 0 ? (
        <Button title={t('users.addBranch')} variant="outline" size="sm" onPress={() => setAdding(true)} />
      ) : null}
      <Text style={styles.hint}>{t('users.bindHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  hint: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingLeft: space.md },
  entryText: { fontSize: font.small, color: colors.foreground },
  add: { gap: space.sm },
});
