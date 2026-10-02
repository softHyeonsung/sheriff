// mobile/src/features/auth/FogReveal.tsx
//
// Login hero: the neighborhood under fog, a first paw print lands, and the fog around it
// clears to meadow — the same moment onboarding's "첫 발자국" delivers for real.
// The cleared patch is the watercolor meadow; fog masses are still flat circles.
import { useEffect } from 'react';
import { Image, StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color } from '@/constants/tokens';

const MEADOW = require('@/assets/images/meadow.jpg');

const CENTER = { left: '40%', top: '48%' } as const;

// Overlapping fog masses; sizes in dp, positions as % of the hero box.
const FOG: { size: number; left: DimensionValue; top: DimensionValue; opacity: number }[] = [
  { size: 260, left: '5%', top: '10%', opacity: 0.75 },
  { size: 220, left: '40%', top: '2%', opacity: 0.6 },
  { size: 240, left: '85%', top: '8%', opacity: 0.7 },
  { size: 200, left: '62%', top: '26%', opacity: 0.55 },
  { size: 230, left: '12%', top: '45%', opacity: 0.7 },
  { size: 250, left: '90%', top: '48%', opacity: 0.75 },
  { size: 190, left: '30%', top: '78%', opacity: 0.6 },
  { size: 210, left: '72%', top: '74%', opacity: 0.65 },
  { size: 170, left: '52%', top: '60%', opacity: 0.45 },
  { size: 160, left: '20%', top: '20%', opacity: 0.5 },
];

// The cleared patch: offset sage circles (dp from the paw) so it reads as an organic clearing, not a target.
const CLEARING = [
  { size: 150, x: 0, y: 0 },
  { size: 110, x: -43, y: 42 },
  { size: 100, x: 39, y: -37 },
  { size: 84, x: 31, y: 64 },
  { size: 70, x: -35, y: -48 },
];

// Surface-colored scallops along the bottom give the fog bank a cloud edge instead of a clipped line.
const EDGE: { size: number; left: DimensionValue }[] = [
  { size: 200, left: '8%' },
  { size: 180, left: '36%' },
  { size: 210, left: '66%' },
  { size: 190, left: '94%' },
];

function Blob({ size, style }: { size: number; style: object }) {
  return (
    <View
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, marginLeft: -size / 2, marginTop: -size / 2 },
        style,
      ]}
    />
  );
}

function PawPrint() {
  const bean = (size: number, left: number, top: number) => (
    <View style={{ position: 'absolute', width: size, height: size * 1.15, borderRadius: size, left, top, backgroundColor: color.primary }} />
  );
  return (
    <View style={styles.paw}>
      {bean(13, 0, 18)}
      {bean(14, 13, 2)}
      {bean(14, 31, 2)}
      {bean(13, 45, 18)}
      <View style={styles.pawPad} />
    </View>
  );
}

export function FogReveal() {
  const reduceMotion = useReducedMotion();
  const paw = useSharedValue(reduceMotion ? 1 : 0);
  const clear = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    paw.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 180 }));
    clear.value = withDelay(420, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [reduceMotion, paw, clear]);

  const pawStyle = useAnimatedStyle(() => ({
    opacity: Math.min(paw.value * 1.5, 1),
    transform: [{ rotate: '-14deg' }, { scale: interpolate(paw.value, [0, 1], [1.5, 1]) }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: clear.value * 0.25,
    transform: [{ scale: interpolate(clear.value, [0, 1], [0.3, 1]) }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    opacity: clear.value,
    transform: [{ scale: interpolate(clear.value, [0, 1], [0.2, 1]) }],
  }));

  return (
    <View style={styles.hero} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {FOG.map((f, i) => (
        <Blob key={i} size={f.size} style={{ left: f.left, top: f.top, backgroundColor: color.fog, opacity: f.opacity }} />
      ))}
      <Animated.View style={[styles.anchor, haloStyle]}>
        {CLEARING.map((c, i) => (
          <Blob key={i} size={c.size * 1.55} style={{ left: c.x, top: c.y, backgroundColor: color.nature }} />
        ))}
      </Animated.View>
      <Animated.View style={[styles.anchor, coreStyle]}>
        {CLEARING.map((c, i) => (
          <Image
            key={i}
            source={MEADOW}
            style={{ position: 'absolute', width: c.size, height: c.size, borderRadius: c.size / 2, left: c.x - c.size / 2, top: c.y - c.size / 2 }}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.anchor, pawStyle]}>
        <PawPrint />
      </Animated.View>
      {EDGE.map((e, i) => (
        <Blob key={i} size={e.size} style={{ left: e.left, top: '102%', backgroundColor: color.surface }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, overflow: 'hidden' }, // runs under the status bar: fog fills the top edge
  anchor: { position: 'absolute', left: CENTER.left, top: CENTER.top, width: 0, height: 0, alignItems: 'center', justifyContent: 'center' },
  paw: { width: 58, height: 60 },
  pawPad: {
    position: 'absolute',
    left: 11,
    top: 26,
    width: 36,
    height: 30,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 15,
    borderBottomRightRadius: 15,
    backgroundColor: color.primary,
  },
});
