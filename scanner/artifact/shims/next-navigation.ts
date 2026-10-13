import { useSyncExternalStore } from 'react';
import { getPath, navigate, refresh, subscribe } from './router';

export function usePathname() {
  return useSyncExternalStore(subscribe, getPath);
}
export function useRouter() {
  return { push: navigate, replace: navigate, refresh, back: () => navigate('/opportunites') };
}
export function notFound(): never {
  throw new Error('introuvable');
}
