/**
 * One row per version: what the core said, in its own words.
 *
 * Every row has the same collapsed height whatever its state — waiting,
 * downloading (with a progress bar), checking, done — so nothing jumps while
 * a 12 MB core arrives. A row with something to read (a refusal, missing
 * files, notes) opens on click; with few rows the problems open by
 * themselves.
 */
import {
  CaretRightIcon,
  CircleDashedIcon,
  CircleNotchIcon,
  FileArrowUpIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import { useState, type ComponentType } from 'react';
import { CodeBlock } from '../../components/CodeBlock';
import { ChannelBadge } from '../../components/VersionPicker';
import { Badge, Button, Progress } from '../../components/ui';
import { ASSET_DIR, useEngine, type BuildInfo, type Verdict } from '../../engine';
import { useLang, useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatBytes, formatMs, percent } from '../../lib/format';
import type { Row } from './check-store';
import { VERDICT_LABEL, VERDICT_STYLE } from './verdicts';

interface Props {
  rows: Row[];
  builds: BuildInfo[];
  stale: boolean;
  running: boolean;
  onAttach: (paths: string[]) => void;
  onRecheck: (tag: string) => void;
}

export function ResultsMatrix({ rows, builds, stale, running, onAttach, onRecheck }: Props) {
  const t = useT();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const counts = new Map<Verdict, number>();
  for (const r of rows) if (r.result) counts.set(r.result.verdict, (counts.get(r.result.verdict) ?? 0) + 1);
  const done = rows.filter(r => r.status === 'done').length;
  const problems = rows.filter(r => r.result && r.result.verdict !== 'ok').length;
  const shown = onlyProblems ? rows.filter(r => !r.result || r.result.verdict !== 'ok') : rows;
  const autoOpen = rows.length <= 3;

  return (
    <section aria-labelledby="results-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="results-title" className="text-base font-semibold">
          {t('results.title')}
          <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums" aria-live="polite">
            {running ? t('results.progress', { done, total: rows.length }) : t('results.doneCount', { done, total: rows.length })}
          </span>
        </h2>
        {rows.length > 5 && problems > 0 && (
          <Button size="sm" variant={onlyProblems ? 'secondary' : 'ghost'} onClick={() => setOnlyProblems(v => !v)} aria-pressed={onlyProblems}>
            {t('results.onlyProblems', { n: problems })}
          </Button>
        )}
      </div>

      {counts.size > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(VERDICT_LABEL) as Verdict[]).map(v => {
            const n = counts.get(v);
            if (!n) return null;
            const { icon: Icon, tone } = VERDICT_STYLE[v];
            return (
              <Badge key={v} variant="outline" className="gap-1 py-1 font-normal">
                <Icon weight="fill" className={cn('size-3.5', tone)} />
                {t(VERDICT_LABEL[v])}
                <span className="tabular-nums text-muted-foreground">{n}</span>
              </Badge>
            );
          })}
        </div>
      )}

      {stale && (
        <p className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-warning">
          <WarningCircleIcon className="size-4 shrink-0" />
          {t('results.stale')}
        </p>
      )}

      <ul className="divide-y overflow-hidden rounded-lg border bg-card">
        {shown.map(row => (
          <ResultRow
            key={row.tag}
            row={row}
            build={builds.find(b => b.tag === row.tag)}
            defaultOpen={autoOpen && !!row.result && row.result.verdict !== 'ok'}
            canRecheck={!running}
            onAttach={onAttach}
            onRecheck={onRecheck}
          />
        ))}
      </ul>
    </section>
  );
}

function ResultRow({
  row,
  build,
  defaultOpen,
  canRecheck,
  onAttach,
  onRecheck,
}: {
  row: Row;
  build?: BuildInfo;
  defaultOpen: boolean;
  canRecheck: boolean;
  onAttach: (paths: string[]) => void;
  onRecheck: (tag: string) => void;
}) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const tagState = useEngine(s => s.tags[row.tag]);
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? defaultOpen;
  const r = row.result;
  const hasDetail = !!r && (r.verdict !== 'ok' || !!r.skipped?.length || r.log.length > 0);
  const downloading = row.status === 'running' && tagState?.phase === 'downloading';

  let Icon: ComponentType<{ className?: string; weight?: 'fill' | 'regular' | 'bold' }> = CircleDashedIcon;
  let tone = 'text-muted-foreground';
  let label = t('results.queued');
  let line: string = t('results.waiting');
  if (row.status === 'running') {
    Icon = CircleNotchIcon;
    tone = 'text-primary animate-spin';
    label = downloading ? t('results.downloading') : t('results.checking');
    line = downloading
      ? `${percent(tagState.loaded, tagState.total)}% · ${formatBytes(tagState.loaded, lang)} / ${formatBytes(tagState.total, lang)}`
      : t('results.checkingLine');
  } else if (row.status === 'cancelled') {
    label = t('results.cancelled');
    line = t('results.cancelledLine');
  } else if (r) {
    Icon = VERDICT_STYLE[r.verdict].icon;
    tone = VERDICT_STYLE[r.verdict].tone;
    label = t(VERDICT_LABEL[r.verdict]);
    line =
      r.verdict === 'ok'
        ? r.skipped?.length
          ? t('results.okWithNotes', { n: r.skipped.length })
          : t('results.okLine', { time: formatMs(r.durationMs) })
        : r.verdict === 'inconclusive'
          ? t('results.missingLine', { files: (r.missingFiles ?? []).map(f => f.split('/').pop()).join(', ') || '?' })
          : (r.error?.split('\n')[0] ?? '');
  }

  const header = (
    <>
      <Icon weight={r ? 'fill' : 'regular'} className={cn('mt-0.5 size-5 shrink-0', tone)} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-sm font-medium">{row.tag}</span>
          {build && <ChannelBadge build={build} className="px-1.5 py-0 text-[11px]" />}
          {r?.coreVersion && r.coreVersion !== row.tag.replace(/^v/, '') && (
            <span className="text-xs text-muted-foreground">({r.coreVersion})</span>
          )}
          <span className={cn('ml-auto text-sm font-medium', r ? VERDICT_STYLE[r.verdict].tone : 'text-muted-foreground')}>{label}</span>
        </span>
        <span className={cn('mt-0.5 block truncate text-xs text-muted-foreground', r?.verdict === 'error' && 'font-mono')}>{line}</span>
        <span className="mt-1.5 block h-1">
          {downloading && <Progress value={percent(tagState.loaded, tagState.total)} className="h-1" aria-label={t('results.downloading')} />}
        </span>
      </span>
    </>
  );

  return (
    <li>
      {hasDetail ? (
        <button
          type="button"
          className="flex w-full items-start gap-3 px-3 pt-2.5 pb-1.5 text-left outline-none hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-4"
          aria-expanded={isOpen}
          onClick={() => setOpen(!isOpen)}
        >
          {header}
          <CaretRightIcon className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-90')} />
        </button>
      ) : (
        <div className="flex items-start gap-3 px-3 pt-2.5 pb-1.5 sm:px-4">
          {header}
          <span className="size-4 shrink-0" />
        </div>
      )}
      {hasDetail && isOpen && r && (
        <div className="space-y-3 px-3 pt-1 pb-4 sm:pr-4 sm:pl-12">
          {r.error && r.verdict !== 'ok' && <CodeBlock text={r.error} tone={r.verdict === 'error' || r.verdict === 'crashed' ? 'error' : 'default'} copyLabel={t('results.copyMessage')} />}
          {r.verdict === 'inconclusive' && (
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">{t('results.inconclusiveExplain')}</p>
              <ul className="flex flex-wrap gap-1.5">
                {(r.missingFiles ?? []).map(f => (
                  <li key={f}>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{f}</code>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onAttach(r.missingFiles ?? [])}>
                  <FileArrowUpIcon />
                  {(r.missingFiles ?? []).every(f => f.startsWith(`${ASSET_DIR}/geo`)) ? t('results.attachGeo') : t('results.attachFiles')}
                </Button>
                <Button size="sm" variant="ghost" disabled={!canRecheck} onClick={() => onRecheck(row.tag)}>
                  {t('results.recheck')}
                </Button>
              </div>
            </div>
          )}
          {r.verdict === 'crashed' && <p className="text-sm text-muted-foreground">{t('results.crashedExplain')}</p>}
          {r.verdict === 'timeout' && <p className="text-sm text-muted-foreground">{t('results.timeoutExplain')}</p>}
          {r.verdict === 'unavailable' && <p className="text-sm text-muted-foreground">{t('results.unavailableExplain')}</p>}
          {!!r.skipped?.length && (
            <div className="text-sm">
              <p className="font-medium">{t('results.skipped')}</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {r.skipped.map(s => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {r.log.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('results.log', { n: r.log.length })}</summary>
              <CodeBlock className="mt-2" text={r.log.join('\n')} wrap={false} />
            </details>
          )}
          <p className="text-xs text-muted-foreground tabular-nums">{t('results.duration', { time: formatMs(r.durationMs) })}</p>
        </div>
      )}
    </li>
  );
}
