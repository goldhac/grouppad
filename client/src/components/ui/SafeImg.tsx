import { useState } from 'react';

/** Warm, theme-aware placeholder (a tinted Peak glyph) — never a broken-image glyph. */
function placeholder(): string {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = dark ? '#1A2624' : '#EFE7DA';
  const fg = dark ? '#3B4844' : '#C9B998';
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'>` +
    `<rect width='400' height='300' fill='${bg}'/>` +
    `<g fill='none' stroke='${fg}' stroke-width='10' stroke-linecap='round' stroke-linejoin='round'>` +
    `<path d='M150 175 L200 130 L250 175'/><path d='M167 167 V210 H233 V167'/>` +
    `<circle cx='200' cy='190' r='9' fill='${fg}' stroke='none'/></g></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

/** <img> with a guarded fallback to the warm placeholder. */
export function SafeImg({
  src,
  alt = '',
  ...rest
}: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={failed ? placeholder() : src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
