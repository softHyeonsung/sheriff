// mobile/src/features/auth/useKakaoLogin.ts
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
};

// Fixed, not makeRedirectUri(): that returns exp://… in Expo Go (and throws under jest),
// but Kakao console, app.json scheme and the Edge Function token exchange must all see this exact value.
// Consequence: Kakao login needs a dev build, not Expo Go.
export const KAKAO_REDIRECT_URI = 'sanchaeknyang://oauthredirect';

export function useKakaoLogin() {
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_KAKAO_REST_KEY ?? '',
      redirectUri: KAKAO_REDIRECT_URI,
      responseType: AuthSession.ResponseType.Code,
      scopes: [],
      // Kakao documents no PKCE params, and kakao-custom-token exchanges { code, redirectUri }
      // only — a code_challenge here with no verifier forwarded would break the exchange.
      // CSRF is still covered: useAuthRequest generates and checks `state`.
      usePKCE: false,
    },
    discovery,
  );

  return { request, response, promptAsync };
}
