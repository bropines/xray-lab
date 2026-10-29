import { CheckIcon, CopyIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { copyText } from '../lib/download';
import { cn } from '../lib/cn';
import { Button } from './ui';

interface Props {
  text: string;
  label?: string;
  className?: string;
  /** Icon only (the label goes to aria-label and the tooltip). */
  iconOnly?: boolean;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'ghost' | 'outline' | 'secondary';
}

export function CopyButton({ text, label, className, iconOnly = true, size, variant = 'ghost' }: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  const name = copied ? t('common.copied') : label ?? t('common.copy');
  return (
    <Button
      type="button"
      variant={variant}
      size={size ?? (iconOnly ? 'icon' : 'sm')}
      className={cn(iconOnly && 'size-7 text-muted-foreground hover:text-foreground', className)}
      aria-label={name}
      title={name}
      onClick={async () => setCopied(await copyText(text))}
    >
      {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
      {!iconOnly && <span>{name}</span>}
      <span className="sr-only" aria-live="polite">{copied ? t('common.copied') : ''}</span>
    </Button>
  );
}
