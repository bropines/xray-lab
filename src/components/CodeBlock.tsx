import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { CopyButton } from './CopyButton';

interface Props {
  text: string;
  className?: string;
  /** Shown before the text, e.g. a `$` prompt; not copied. */
  prefix?: ReactNode;
  tone?: 'default' | 'error';
  maxHeight?: string;
  copyLabel?: string;
  wrap?: boolean;
}

/** Monospace text with a copy button — commands, core messages, keys. */
export function CodeBlock({ text, className, prefix, tone = 'default', maxHeight = '20rem', copyLabel, wrap = true }: Props) {
  return (
    <div
      className={cn(
        'group relative rounded-md border bg-muted/40 font-mono text-[13px] leading-relaxed',
        tone === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
        className,
      )}
    >
      <pre
        className={cn('custom-scroll overflow-auto py-2 pr-10 pl-3', wrap ? 'break-words whitespace-pre-wrap' : 'whitespace-pre')}
        style={{ maxHeight }}
        tabIndex={0}
      >
        {prefix && <span className="text-muted-foreground select-none">{prefix}</span>}
        {text}
      </pre>
      <CopyButton text={text} label={copyLabel} className="absolute top-1 right-1" />
    </div>
  );
}
