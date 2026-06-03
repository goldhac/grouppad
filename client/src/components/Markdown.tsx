import { useMemo } from 'react';
import { mdToHtml } from '@/lib/utils';
import { cn } from '@/lib/cn';

/** Renders the constrained, safe Markdown subset produced by the AI endpoints. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => mdToHtml(text), [text]);
  return <div className={cn('md text-sm text-text', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
