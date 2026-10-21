import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, PanResponder, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RestaurantTable } from '@/lib/api';
import { can } from '@/lib/line';
import { useOffline } from '@/lib/offline/provider';
import { useRecordWriter } from '@/lib/offline/use-record';
import { useSession } from '@/lib/session';
import { CANVAS_H, CANVAS_W, clamp, clearBody, hasChanges, layoutBody, layoutOf, savedPositions, snap, TILE_H, TILE_W, type Point } from '@/lib/table-layout';
import { Button } from '@/ui/components';
import { ScreenHeader } from '@/ui/screen-header';
import { ErrorState, LoadingState } from '@/ui/states';
import { colors, font, radius, space } from '@/ui/theme';

/** A table tile that follows the finger; it reports where it was dropped (snapped to the grid and kept on the canvas). */
function Tile({ table, at, onDragging, onMove }: { table: RestaurantTable; at: Point; onDragging: (on: boolean) => void; onMove: (id: string, p: Point) => void }) {
  const [live, setLive] = useState<Point | null>(null);
  // what the gesture needs to know, kept current by the effect below (the responder is made once)
  const track = useRef({ start: at, latest: at, id: table.id, onDragging, onMove });
  useEffect(() => {
    track.current = { start: track.current.start, latest: at, id: table.id, onDragging, onMove };
  });
  // the handlers read the ref only when a gesture happens, never while rendering
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        track.current.start = track.current.latest;
        track.current.onDragging(true);
      },
      onPanResponderMove: (_, g) => setLive(clamp({ x: track.current.start.x + g.dx, y: track.current.start.y + g.dy })),
      onPanResponderRelease: (_, g) => {
        const k = track.current;
        k.onMove(k.id, snap(clamp({ x: k.start.x + g.dx, y: k.start.y + g.dy })));
        setLive(null);
        k.onDragging(false);
      },
      onPanResponderTerminate: () => {
        setLive(null);
        track.current.onDragging(false);
      },
    }),
  );
  const p = live ?? at;
  return (
    <View {...responder.panHandlers} style={[styles.tile, { left: p.x, top: p.y }, live && styles.tileLive]} accessibilityLabel={table.table_name}>
      <Text style={styles.tileName} numberOfLines={1}>
        {table.table_name}
      </Text>
      {table.setting_capacity ? <Text style={styles.tileSub}>{table.setting_capacity}</Text> : null}
    </View>
  );
}

/** The table floor plan like the kh-pos web "table flow": drag each table where it stands in the room, then save. Saving needs the server. */
export default function TableLayoutScreen() {
  const { t } = useTranslation();
  const { user } = useSession();
  const { data } = useOffline();
  const writer = useRecordWriter();
  const [tables, setTables] = useState<RestaurantTable[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [original, setOriginal] = useState<Record<string, Point>>({});
  const [current, setCurrent] = useState<Record<string, Point>>({});
  const [saved, setSaved] = useState<Record<string, Point>>({});
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = (await data.tables()).data;
      const plan = layoutOf(rows);
      setTables(rows);
      setSaved(savedPositions(rows));
      setOriginal(plan);
      setCurrent(plan);
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [data]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onMove = useCallback((id: string, p: Point) => setCurrent((c) => ({ ...c, [id]: p })), []);
  const canEdit = can(user, 'table', 'update');

  function save() {
    const body = layoutBody(current, original, saved);
    if (body.length === 0) return;
    void (async () => {
      setBusy(true);
      try {
        // sent at once, or kept on the phone and sent when kh-pos can be reached
        const how = await writer({ entity: 'table-layout', op: 'action', recordId: 'layout', method: 'PUT', path: '/api/table/layout', body, label: t('tableSetup.title') });
        Alert.alert(how === 'queued' ? t('offline.savedOffline') : t('layout.saved'));
        await load();
      } catch (e) {
        Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
      } finally {
        setBusy(false);
      }
    })();
  }

  function reset() {
    Alert.alert(t('layout.resetConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('layout.reset'),
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const how = await writer({ entity: 'table-layout', op: 'action', recordId: 'layout-reset', method: 'PUT', path: '/api/table/layout', body: clearBody((tables ?? []).map((x) => x.id)), label: t('layout.reset') });
              if (how === 'queued') Alert.alert(t('offline.savedOffline'));
              await load();
            } catch (e) {
              Alert.alert(t('errors.server'), e instanceof Error ? e.message : undefined);
            }
          })(),
      },
    ]);
  }

  const changed = hasChanges(current, original);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={t('more.tableLayout')} />
      {tables === null ? (
        error ? <ErrorState error={error} onRetry={() => void load()} /> : <LoadingState />
      ) : (
        <>
          <Text style={styles.hint}>{canEdit ? t('layout.hint') : t('layout.readOnly')}</Text>
          <ScrollView horizontal scrollEnabled={!dragging} style={styles.flex} contentContainerStyle={{ width: CANVAS_W }}>
            <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ height: CANVAS_H }}>
              <View style={styles.canvas} pointerEvents={canEdit ? 'auto' : 'none'}>
                {tables.map((tb) => (
                  <Tile key={tb.id} table={tb} at={current[tb.id] ?? { x: 0, y: 0 }} onDragging={setDragging} onMove={onMove} />
                ))}
              </View>
            </ScrollView>
          </ScrollView>
          {canEdit ? (
            <View style={styles.footer}>
              <Button title={t('layout.reset')} variant="outline" onPress={reset} style={styles.flex} />
              <Button title={t('layout.discard')} variant="outline" disabled={!changed} onPress={() => setCurrent(original)} style={styles.flex} />
              <Button title={t('customize.save')} loading={busy} disabled={!changed} onPress={save} style={styles.flex} />
            </View>
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  flex: { flex: 1 },
  hint: { padding: space.md, fontSize: font.small, color: colors.mutedForeground },
  canvas: { width: CANVAS_W, height: CANVAS_H, backgroundColor: colors.card },
  tile: { position: 'absolute', width: TILE_W, height: TILE_H, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center', padding: 4 },
  tileLive: { borderColor: colors.primary, borderWidth: 2, opacity: 0.9 },
  tileName: { fontSize: font.body, fontWeight: '700', color: colors.foreground },
  tileSub: { fontSize: font.small, color: colors.mutedForeground },
  footer: { flexDirection: 'row', gap: space.sm, padding: space.md, backgroundColor: colors.card, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
