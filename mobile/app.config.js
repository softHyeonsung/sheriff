// Adds the Kakao native SDK plugin on top of app.json. The native app key is read from
// .env.local so it lives next to the other Kakao/Supabase keys instead of in app.json.
module.exports = ({ config }) => {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  if (!nativeAppKey) throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY is missing from mobile/.env.local');
  // 로컬 Supabase(http://)에 붙는 빌드에서만 평문 HTTP를 허용한다: 릴리스 APK는 기본으로 막혀 있어
  // 에뮬레이터·폰에서 PC의 서버에 못 붙는다. https 주소(배포)로 만든 빌드에는 들어가지 않는다.
  const localHttp = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').startsWith('http://');
  const plugins = config.plugins.map((p) =>
    localHttp && Array.isArray(p) && p[0] === 'expo-build-properties'
      ? [p[0], { ...p[1], android: { ...p[1].android, usesCleartextTraffic: true } }]
      : p,
  );
  return {
    ...config,
    plugins: [...plugins, ['@react-native-kakao/core', { nativeAppKey }]],
  };
};
