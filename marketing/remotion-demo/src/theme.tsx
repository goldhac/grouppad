// GroupPad brand tokens, pulled 1:1 from the app's design system.
export const C = {
  teal: '#134E4A',
  teal2: '#2E8C7C',
  tealLight: '#A8D8CE',
  cream: '#EFE7DA',
  card: '#FFFDF8',
  border: '#E7DDC9',
  chip: '#F6EFE1',
  gold: '#E6BC54',
  ink: '#16201E',
  body: '#45514F',
  muted: '#7B847D',
  green: '#1F7A50',
  over: '#B0413B',
};

import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadBody } from '@remotion/google-fonts/HankenGrotesk';

export const display = loadDisplay().fontFamily;
export const sans = loadBody().fontFamily;

// The GroupPad house mark.
export const Mark: React.FC<{ size?: number }> = ({ size = 56 }) => (
  <svg width={size} height={size} viewBox="0 0 56 56">
    <rect width="56" height="56" rx="16" fill={C.teal} />
    <path d="M14 31 L28 17 L42 31" fill="none" stroke="#ECF3F1" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 29 V41 H38 V29" fill="none" stroke="#ECF3F1" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="28" cy="35" r="3.4" fill={C.gold} />
  </svg>
);
