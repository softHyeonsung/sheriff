import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { color, font } from '@/constants/tokens';

// 탭 바도 앱의 색으로: 흰 판, 고른 탭은 하늘색 표시(시그니처), 글자는 잉크. (시스템 다크 모드를 따라가지 않는다 — 앱 전체가 밝은 테마 하나.)
export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={color.surfaceCard}
      indicatorColor={color.skyLight}
      iconColor={{ default: color.inkSub, selected: color.skyInk }}
      labelStyle={{
        default: { color: color.inkSub, fontFamily: font.medium, fontSize: 12 },
        selected: { color: color.ink, fontFamily: font.semibold, fontSize: 12 },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>지도</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>내 고양이</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'pawprint', selected: 'pawprint.fill' }} md="pets" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
