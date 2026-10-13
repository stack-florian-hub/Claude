// Routeur en mémoire de l'artefact (le lien d'un artefact ne transporte qu'une ancre simple).
type L = () => void;
let path = '/opportunites';
const listeners = new Set<L>();
let version = 0;
export const getPath = () => path;
export const getVersion = () => version;
export function navigate(p: string) {
  path = p.split('#')[0] || '/opportunites';
  try { window.scrollTo(0, 0); } catch {}
  emit();
}
export function refresh() { version++; emit(); }
export function emit() { listeners.forEach((l) => l()); }
export function subscribe(l: L) { listeners.add(l); return () => { listeners.delete(l); }; }
