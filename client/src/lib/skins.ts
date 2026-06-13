/** Named UI skins — must match the server whitelist + ds2/themes.css. A skin
 *  recolors the brand (accent + surfaces + decision pop), composing with the
 *  light/dark theme. Swatch colors below are just for the picker dots. */
export const SKINS = [
  { id: 'classic',    label: 'Classic',      sub: 'Warm teal',        accent: '#134E4A', decision: '#D7A12E' },
  { id: 'tropical',   label: 'Tropical',     sub: 'Turquoise + coral', accent: '#0E7C75', decision: '#EE6A45' },
  { id: 'coastal',    label: 'Coastal',      sub: 'Slate blue',        accent: '#3A5A7D', decision: '#C9A24E' },
  { id: 'sunset',     label: 'Sunset',       sub: 'Terracotta',        accent: '#C0512F', decision: '#E1A33C' },
  { id: 'pinksummer', label: 'Pink Summer',  sub: 'Fuchsia + blush',   accent: '#C0397E', decision: '#ECB446' },
  { id: 'forest',     label: 'Forest',       sub: 'Pine · cabin',      accent: '#2F6B3C', decision: '#D98E2B' },
] as const;

export type SkinId = (typeof SKINS)[number]['id'];
export const SKIN_IDS = SKINS.map((s) => s.id) as SkinId[];
export const isSkin = (s: unknown): s is SkinId => typeof s === 'string' && (SKIN_IDS as string[]).includes(s);

const SKIN_LS = 'gp_skin';

/** Set (or clear, for classic) the data-skin attribute on <html>. */
export function applySkin(skin: string | null | undefined): void {
  const el = document.documentElement;
  if (skin && skin !== 'classic' && isSkin(skin)) el.setAttribute('data-skin', skin);
  else el.removeAttribute('data-skin');
}

/** The viewer's personal override (wins over the trip default); '' = follow trip. */
export function readPersonalSkin(): SkinId | '' {
  try { const v = localStorage.getItem(SKIN_LS); return isSkin(v) ? v : ''; } catch { return ''; }
}
export function writePersonalSkin(skin: SkinId | ''): void {
  try { if (skin) localStorage.setItem(SKIN_LS, skin); else localStorage.removeItem(SKIN_LS); } catch { /* ignore */ }
}
