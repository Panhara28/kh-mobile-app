import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/ui/text';
import { ACTIONS, availableResources, isEnabled, resourceLabel, type Permissions } from '@/lib/accessibility';
import { Button, Chip } from '@/ui/components';
import { colors, font, radius, space } from '@/ui/theme';

/**
 * The resources of one role with a switch for each action (Read is always on), a remove button per resource and
 * the chips to add another resource. Shared by the role cards and the "new role" form.
 */
export function PermissionList({
  permissions,
  canUpdate,
  canDelete,
  canAdd,
  onToggle,
  onRemove,
  onAdd,
}: {
  permissions: Permissions;
  canUpdate: boolean;
  canDelete: boolean;
  canAdd: boolean;
  onToggle: (resource: string, action: (typeof ACTIONS)[number], enabled: boolean) => void;
  onRemove: (resource: string) => void;
  onAdd: (resource: string) => void;
}) {
  const { t } = useTranslation();
  const entries = Object.entries(permissions).sort(([a], [b]) => a.localeCompare(b));
  const free = availableResources(permissions);

  return (
    <View style={styles.list}>
      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('acc.noPermissions')}</Text>
          <Text style={styles.muted}>{t('acc.addBelow')}</Text>
        </View>
      ) : null}
      {entries.map(([resource, actions]) => (
        <View key={resource} style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.flex}>
              <Text style={styles.resource}>{resourceLabel(resource)}</Text>
              <Text style={styles.muted}>{t(`acc.desc_${resource}`, { defaultValue: t('acc.descDefault', { name: resourceLabel(resource) }) })}</Text>
            </View>
            <Button title="✕" variant="ghost" size="sm" disabled={!canDelete} onPress={() => onRemove(resource)} accessibilityLabel={t('acc.removeResource', { name: resourceLabel(resource) })} />
          </View>
          {ACTIONS.map((action) => (
            <View key={action} style={styles.row}>
              <Text style={styles.rowLabel}>{t('acc.allow', { action: t(`acc.action_${action}`) })}</Text>
              <Switch value={isEnabled(actions, action)} disabled={!canUpdate || action === 'read'} onValueChange={(v) => onToggle(resource, action, v)} />
            </View>
          ))}
        </View>
      ))}
      {canAdd ? (
        <View style={styles.section}>
          <Text style={styles.resource}>{t('acc.addResource')}</Text>
          <Text style={styles.muted}>{t('acc.addResourceHint')}</Text>
          <View style={styles.chips}>
            {free.map((r) => (
              <Chip key={r} label={resourceLabel(r)} selected={false} onPress={() => onAdd(r)} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md },
  flex: { flex: 1 },
  empty: { alignItems: 'center', gap: space.xs, padding: space.lg },
  emptyTitle: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  section: { gap: space.xs, padding: space.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.page },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  resource: { fontSize: font.body, fontWeight: '700', color: colors.foreground, textTransform: 'capitalize' },
  muted: { fontSize: font.small, color: colors.mutedForeground, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.xs },
  rowLabel: { flex: 1, fontSize: font.body, color: colors.foreground },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
});
