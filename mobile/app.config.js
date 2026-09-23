// Adds the Kakao native SDK plugin on top of app.json. The native app key is read from
// .env.local so it lives next to the other Kakao/Supabase keys instead of in app.json.
module.exports = ({ config }) => {
  const nativeAppKey = process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY;
  if (!nativeAppKey) throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY is missing from mobile/.env.local');
  return {
    ...config,
    plugins: [...config.plugins, ['@react-native-kakao/core', { nativeAppKey }]],
  };
};
