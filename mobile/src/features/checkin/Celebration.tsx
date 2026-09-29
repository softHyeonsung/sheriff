// mobile/src/features/checkin/Celebration.tsx
// The loop's peak moment (DESIGN.md §3): the new stage springs in with soft particles and a haptic.
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, font, radius, space, type } from '@/constants/tokens';
import type { GradeThresholds } from '@/features/map/useMyHideouts';
import { markerFor } from '@/map/markers';
import type { CheckinResult } from './checkinApi';
import { celebrationCopy, dongStageLine } from './copy';

const PARTICLES = 8;

function Particle({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const angle = (index / PARTICLES) * Math.PI * 2;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3, 1], [0, 1, 0]),
    transform: [
      { translateX: Math.cos(angle) * 90 * progress.value },
      { translateY: Math.sin(angle) * 90 * progress.value },
    ],
  }));
  return <Animated.View style={[styles.particle, style]} />;
}

export function Celebration({ result, thresholds, onClose }: { result: CheckinResult; thresholds: GradeThresholds | null; onClose: () => void }) {
  const reduceMotion = useReducedMotion();
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  const burst = useSharedValue(reduceMotion ? 1 : 0);
  const { title, hint } = celebrationCopy(result, thresholds);
  const dongLine = dongStageLine(result);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (reduceMotion) return;
    pop.value = withSpring(1, { damping: 8, stiffness: 160 });
    burst.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [reduceMotion, pop, burst]);

  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(pop.value * 2, 1),
    transform: [{ scale: interpolate(pop.value, [0, 1], [0.4, 1]) }],
  }));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.stage}>
            {!reduceMotion && Array.from({ length: PARTICLES }, (_, i) => <Particle key={i} index={i} progress={burst} />)}
            <Animated.Image source={{ uri: markerFor(result.grade).uri }} style={[styles.art, popStyle]} />
          </View>
          <Text style={styles.name}>{result.name}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          {hint && <Text style={styles.hint}>{hint}</Text>}
          {dongLine && <Text style={styles.hint}>{dongLine}</Text>}
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="좋아요" style={styles.cta}>
            <Text style={styles.ctaText}>좋아요</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(74, 61, 48, 0.35)', alignItems: 'center', justifyContent: 'center', padding: space.gutter }, // color.ink @ 35%
  card: { alignSelf: 'stretch', backgroundColor: color.surface, borderRadius: radius.sheet, padding: space.section, alignItems: 'center', gap: 8 },
  stage: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  art: { width: 140, height: 140 },
  particle: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: color.primary },
  name: { ...type.caption, color: color.inkSub },
  title: { ...type.subtitle, color: color.ink, textAlign: 'center' },
  hint: { ...type.body, color: color.inkSub, textAlign: 'center' },
  cta: {
    alignSelf: 'stretch',
    marginTop: 12,
    height: 52,
    borderRadius: radius.btn,
    backgroundColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { fontFamily: font.semibold, fontSize: 16, color: color.onPrimary },
});
