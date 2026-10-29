import { InfoIcon } from '@phosphor-icons/react';
import { useT } from '../../i18n';

/** What a "Loads" verdict proves, and what it cannot. */
export function WhatLoadsMeans() {
  const t = useT();
  return (
    <details className="group rounded-lg border bg-card px-4 py-3 text-sm open:pb-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
        <InfoIcon className="size-4 text-primary" />
        {t('explain.title')}
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">{t('explain.more')}</span>
      </summary>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <p>{t('explain.what')}</p>
        <div>
          <p className="font-medium text-foreground">{t('explain.notTitle')}</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>{t('explain.notStart')}</li>
            <li>{t('explain.notOs')}</li>
            <li>{t('explain.notFiles')}</li>
            <li>{t('explain.notWorks')}</li>
          </ul>
        </div>
        <p>{t('explain.verdicts')}</p>
      </div>
    </details>
  );
}
