// mobile/src/features/onboarding/route.ts
import type { Me } from '@/stores/meStore';

export type Route = 'loading' | 'error' | 'login' | 'onboarding' | 'tabs';
type Status = 'idle' | 'loading' | 'ready' | 'error';

export function routeFor({ hasSession, status, me }: { hasSession: boolean; status: Status; me: Me | null }): Route {
  if (!hasSession) return 'login';
  if (status === 'error') return 'error';
  if (status !== 'ready' || !me) return 'loading';
  return me.onboarded ? 'tabs' : 'onboarding';
}
