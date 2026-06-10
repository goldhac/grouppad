// Zero-dependency, deterministic SVG avatars in the friendly "beam" style
// (after Boring Avatars, MIT). No network, no storage, no per-avatar cost:
// every seed renders the same little face every time, so a stored seed string
// is all we keep. Used alongside the illustrated animal PNGs.

const SIZE = 36;

// Warm, editorial palette tuned to the GroupPad brand (teal + sand + a few pops).
const PALETTE = ['#0E7C66', '#E9B949', '#E07A5F', '#5B7DB1', '#9B6A9E', '#E7E0D0'];

function hashCode(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (Math.imul(31, hash) + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
function getDigit(n: number, ntn: number) { return Math.floor((n / Math.pow(10, ntn)) % 10); }
function getBoolean(n: number, ntn: number) { return !(getDigit(n, ntn) % 2); }
function getUnit(n: number, range: number, index?: number) {
  const value = n % range;
  if (index && getDigit(n, index) % 2 === 0) return -value;
  return value;
}
function getColor(n: number, shift = 0) { return PALETTE[(n + shift) % PALETTE.length]; }
function contrast(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? '#1d1d1f' : '#ffffff';
}

function beam(seed: string) {
  const n = hashCode(seed);
  const preTX = getUnit(n, 10, 1);
  const wrapperTranslateX = preTX < 5 ? preTX + SIZE / 9 : preTX;
  const preTY = getUnit(n, 10, 2);
  const wrapperTranslateY = preTY < 5 ? preTY + SIZE / 9 : preTY;
  const wrapperColor = getColor(n, 0);
  return {
    wrapperColor,
    faceColor: contrast(wrapperColor),
    backgroundColor: getColor(n, 3),
    wrapperTranslateX,
    wrapperTranslateY,
    wrapperRotate: getUnit(n, 360),
    wrapperScale: 1 + getUnit(n, SIZE / 12) / 10,
    isMouthOpen: getBoolean(n, 2),
    isCircle: getBoolean(n, 1),
    eyeSpread: getUnit(n, 5),
    mouthSpread: getUnit(n, 3),
    faceRotate: getUnit(n, 10, 3),
    faceTranslateX: wrapperTranslateX > SIZE / 6 ? wrapperTranslateX / 2 : getUnit(n, 8, 1),
    faceTranslateY: wrapperTranslateY > SIZE / 6 ? wrapperTranslateY / 2 : getUnit(n, 7, 2),
  };
}

/** Prefix that marks a stored avatar value as a generated seed (vs. an animal key). */
export const GEN_PREFIX = 'g-';

/** A curated set of generated avatars offered in the picker. */
export const GENERATED_AVATARS = [
  'maple', 'cobalt', 'poppy', 'fern', 'plum', 'ember',
  'tide', 'dune', 'aster', 'slate', 'coral', 'moss',
  'opal', 'rust', 'iris', 'sage', 'clay', 'sky',
].map((s) => GEN_PREFIX + s);

export function GeneratedAvatar({ seed, size = 32, className }: { seed: string; size?: number; className?: string }) {
  const d = beam(seed);
  const maskId = `gpm-${seed.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      fill="none"
      role="img"
      width={size}
      height={size}
      className={className}
      style={{ borderRadius: '50%', display: 'block', flex: 'none' }}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={SIZE} height={SIZE}>
        <rect width={SIZE} height={SIZE} rx={SIZE * 2} fill="#fff" />
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect width={SIZE} height={SIZE} fill={d.backgroundColor} />
        <rect
          x="0" y="0" width={SIZE} height={SIZE}
          transform={`translate(${d.wrapperTranslateX} ${d.wrapperTranslateY}) rotate(${d.wrapperRotate} ${SIZE / 2} ${SIZE / 2}) scale(${d.wrapperScale})`}
          fill={d.wrapperColor}
          rx={d.isCircle ? SIZE : SIZE / 6}
        />
        <g transform={`translate(${d.faceTranslateX} ${d.faceTranslateY}) rotate(${d.faceRotate} ${SIZE / 2} ${SIZE / 2})`}>
          {d.isMouthOpen ? (
            <path d={`M15 ${19 + d.mouthSpread}c2 1 4 1 6 0`} stroke={d.faceColor} fill="none" strokeLinecap="round" />
          ) : (
            <path d={`M13,${19 + d.mouthSpread} a1,0.75 0 0,0 10,0`} fill={d.faceColor} />
          )}
          <rect x={14 - d.eyeSpread} y={14} width={1.5} height={2} rx={1} fill={d.faceColor} />
          <rect x={20 + d.eyeSpread} y={14} width={1.5} height={2} rx={1} fill={d.faceColor} />
        </g>
      </g>
    </svg>
  );
}
