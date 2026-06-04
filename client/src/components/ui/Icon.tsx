import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Single, swappable icon import point. Wraps a lucide icon with the v2 signature
 * defaults (1.75 stroke, round caps via lucide, token-sized). Swap the underlying
 * library here once and the whole app follows.
 *
 *   import { Icon } from '@/components/ui/Icon';
 *   import { ThumbsUp } from 'lucide-react';
 *   <Icon icon={ThumbsUp} size="md" />
 */
type IconSize = 'sm' | 'md' | 'lg' | number;
const SIZE_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 14, md: 16, lg: 20 };

export function Icon({
  icon: Glyph,
  size = 'md',
  strokeWidth = 1.75,
  ...rest
}: { icon: LucideIcon; size?: IconSize } & Omit<LucideProps, 'size' | 'ref'>) {
  const px = typeof size === 'number' ? size : SIZE_PX[size];
  return <Glyph size={px} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
