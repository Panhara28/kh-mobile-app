import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Trash2 } from "lucide-react-native";
import { Text } from "@/ui/text";
import { colors, font } from "./theme";

const ACTION_WIDTH = 88;

/**
 * A list row that slides left to show a red Remove button behind it (the iOS mail / cart gesture). Built on
 * PanResponder, so it works inside a Modal and a vertical ScrollView without extra native modules: only a mostly
 * sideways drag takes the touch, so scrolling the list still works.
 */
export function SwipeRow({
  open,
  onOpenChange,
  onRemove,
  removeLabel,
  disabled,
  children,
}: {
  /** Whether the Remove button is showing (one row open at a time is up to the list). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemove: () => void;
  removeLabel: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const [x] = useState(() => new Animated.Value(0));
  const base = useRef(0);
  const latest = useRef({ onOpenChange, disabled });
  useEffect(() => {
    latest.current = { onOpenChange, disabled };
  });

  useEffect(() => {
    base.current = open ? -ACTION_WIDTH : 0;
    Animated.spring(x, {
      toValue: base.current,
      useNativeDriver: true,
      bounciness: 0,
      speed: 20,
    }).start();
  }, [open, x]);

  // the refs are read only inside the gesture callbacks, never while rendering
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        !latest.current.disabled &&
        Math.abs(g.dx) > 10 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponderCapture: (_e, g) =>
        !latest.current.disabled &&
        Math.abs(g.dx) > 14 &&
        Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_e, g) => {
        // follows the finger, a little resistance past the button
        const next = base.current + g.dx;
        x.setValue(
          next > 0
            ? next * 0.2
            : next < -ACTION_WIDTH
              ? -ACTION_WIDTH + (next + ACTION_WIDTH) * 0.3
              : next,
        );
      },
      onPanResponderRelease: (_e, g) => {
        const end = base.current + g.dx;
        const shouldOpen = end < -ACTION_WIDTH / 2 || g.vx < -0.5;
        const target = shouldOpen && g.vx < 0.5 ? -ACTION_WIDTH : 0;
        base.current = target;
        Animated.spring(x, {
          toValue: target,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
        latest.current.onOpenChange(target !== 0);
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, {
          toValue: base.current,
          useNativeDriver: true,
          bounciness: 0,
          speed: 20,
        }).start();
      },
    }),
  );

  // the button fades in as the row slides
  const actionOpacity = x.interpolate({
    inputRange: [-ACTION_WIDTH, -16, 0],
    outputRange: [1, 0.3, 0],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.action, { opacity: actionOpacity }]}>
        <Pressable
          onPress={() => {
            onOpenChange(false);
            onRemove();
          }}
          accessibilityRole="button"
          accessibilityLabel={removeLabel}
          style={({ pressed }) => [
            styles.actionButton,
            pressed && styles.pressed,
          ]}
        >
          <Trash2 size={20} color="#fff" />
          <Text style={styles.actionText}>{removeLabel}</Text>
        </Pressable>
      </Animated.View>
      <Animated.View
        style={[styles.front, { transform: [{ translateX: x }] }]}
        {...responder.panHandlers}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  action: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: ACTION_WIDTH,
    padding: 6,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: colors.destructive,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionText: { color: "#fff", fontSize: font.small, fontWeight: "700" },
  pressed: { opacity: 0.8 },
  front: { backgroundColor: colors.background },
});
