import { cn } from '@/lib/cn';
import { GEN_PREFIX, GENERATED_AVATARS, GeneratedAvatar } from '@/lib/avatar';

/** The illustrated avatar set (hosted under /avatars). */
export const AVATARS = ['fox', 'owl', 'bear', 'cat', 'rabbit'] as const;
export type AvatarId = (typeof AVATARS)[number];

/** Everything offered in the picker: illustrated animals + generated faces. */
export const AVATAR_CHOICES: string[] = [...AVATARS, ...GENERATED_AVATARS];

function initials(name?: string | null) {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || name[0]!.toUpperCase();
}

/** A user's avatar — their chosen picture, or a first+last initials circle. */
export function Avatar({ name, avatar, size = 32, className }: { name?: string | null; avatar?: string | null; size?: number; className?: string }) {
  if (avatar && avatar.startsWith(GEN_PREFIX)) {
    return <GeneratedAvatar seed={avatar} size={size} className={cn('gp-avatar', className)} />;
  }
  if (avatar && (AVATARS as readonly string[]).includes(avatar)) {
    return (
      <img
        src={`/avatars/${avatar}.png`}
        alt=""
        width={size}
        height={size}
        className={cn('gp-avatar', className)}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block', flex: 'none' }}
      />
    );
  }
  return (
    <span
      className={cn('gp-avatar gp-avatar-ini', className)}
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%', flex: 'none',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--accent)', color: 'var(--accent-fg)',
        fontWeight: 700, fontSize: Math.max(10, Math.round(size * 0.4)), lineHeight: 1, letterSpacing: '0.01em',
      }}
    >
      {initials(name)}
    </span>
  );
}
