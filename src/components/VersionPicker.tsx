/**
 * Choosing core versions: one (terminal, tools) or several (Check).
 *
 * The library ships every release from v26.3.27 up, and the list grows on
 * its own, so the picker groups by channel (Stable / Pre-release /
 * Withdrawn), newest first, with a search box, and says for each version
 * whether it is already in this browser or how much it would download.
 */
import { CaretDownIcon, CheckIcon, CloudArrowDownIcon, HardDrivesIcon, MagnifyingGlassIcon } from '@phosphor-icons/react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  CHANNELS,
  FLOOR_TAG,
  REMNAWAVE_TAG,
  channelOf,
  groupBuilds,
  matchesQuery,
  useEngine,
  type BuildInfo,
  type Channel,
  type TagState,
} from '../engine';
import { useLang, useT, type MessageKey } from '../i18n';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/format';
import { Badge, Button, Input, Popover, PopoverContent, PopoverTrigger } from './ui';

const CHANNEL_LABEL: Record<Channel, MessageKey> = {
  stable: 'versions.stable',
  prerelease: 'versions.prerelease',
  withdrawn: 'versions.withdrawn',
};

export function ChannelBadge({ build, className }: { build: Pick<BuildInfo, 'tag' | 'channel'>; className?: string }) {
  const t = useT();
  const ch = channelOf(build);
  if (ch === 'stable') return null;
  return (
    <Badge variant={ch === 'withdrawn' ? 'warning' : 'outline'} className={cn('font-normal', className)}>
      {t(ch === 'withdrawn' ? 'versions.withdrawnShort' : 'versions.prereleaseShort')}
    </Badge>
  );
}

/** "cached" / "loaded" / the download size. */
export function TagAvailability({ build, state }: { build: BuildInfo; state?: TagState }) {
  const t = useT();
  const lang = useLang(s => s.lang);
  if (state?.phase === 'ready' || state?.phase === 'cached') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success" title={t('versions.cachedHint')}>
        <HardDrivesIcon className="size-3.5" />
        {t(state.phase === 'ready' ? 'versions.loaded' : 'versions.cached')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums" title={t('versions.downloadHint')}>
      <CloudArrowDownIcon className="size-3.5" />
      {formatBytes(build.gzip || build.size, lang)}
    </span>
  );
}

function shortDate(iso: string | undefined, lang: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' });
}

function hintFor(tag: string): MessageKey | undefined {
  if (tag === REMNAWAVE_TAG) return 'versions.remnawaveHint';
  if (tag === FLOOR_TAG) return 'versions.floorHint';
  return undefined;
}

interface ListProps {
  builds: BuildInfo[];
  isSelected: (tag: string) => boolean;
  onPick: (tag: string) => void;
  multi: boolean;
  header?: ReactNode;
}

function VersionList({ builds, isSelected, onPick, multi, header }: ListProps) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const tags = useEngine(s => s.tags);
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupBuilds(builds.filter(b => matchesQuery(b, query))), [builds, query]);
  const empty = CHANNELS.every(c => groups[c].length === 0);

  return (
    <div className="flex max-h-[min(70dvh,32rem)] flex-col">
      <div className="space-y-2 border-b p-2">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('versions.search')}
            aria-label={t('versions.search')}
            className="h-8 pl-8"
            autoFocus
          />
        </div>
        {header}
      </div>
      <div className="custom-scroll min-h-0 flex-1 overflow-y-auto p-1" role="listbox" aria-multiselectable={multi}>
        {empty && <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('versions.noMatch')}</p>}
        {CHANNELS.map(ch =>
          groups[ch].length ? (
            <div key={ch} className="py-1">
              <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
                <span>{t(CHANNEL_LABEL[ch])}</span>
                <span className="tabular-nums">{groups[ch].length}</span>
              </div>
              {groups[ch].map(b => {
                const selected = isSelected(b.tag);
                const hint = hintFor(b.tag);
                const date = shortDate(b.publishedAt, lang);
                return (
                  <button
                    key={b.tag}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onPick(b.tag)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none',
                      'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                      selected && !multi && 'bg-accent',
                    )}
                  >
                    {multi ? (
                      <span
                        aria-hidden
                        className={cn(
                          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border shadow-xs',
                          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input dark:bg-input/30',
                        )}
                      >
                        {selected && <CheckIcon weight="bold" className="size-3" />}
                      </span>
                    ) : (
                      <CheckIcon className={cn('size-4 shrink-0', selected ? 'text-primary' : 'invisible')} />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-mono text-[13px]">{b.tag}</span>
                      {(hint || date) && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {[date, hint && t(hint)].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </span>
                    <TagAvailability build={b} state={tags[b.tag]} />
                  </button>
                );
              })}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** One version (terminal, tools). */
export function VersionSelect({ builds, value, onChange, className }: { builds: BuildInfo[]; value?: string; onChange: (tag: string) => void; className?: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const build = builds.find(b => b.tag === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('min-w-0 justify-between gap-2 font-mono', className)} disabled={!builds.length} aria-label={t('versions.choose')}>
          <span className="truncate">xray {value ?? '…'}</span>
          {build && <ChannelBadge build={build} className="px-1 py-0 text-[10px]" />}
          <CaretDownIcon className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),22rem)] p-0">
        <VersionList
          builds={builds}
          multi={false}
          isSelected={tag => tag === value}
          onPick={tag => {
            onChange(tag);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

interface PickerProps {
  builds: BuildInfo[];
  selected: string[];
  onChange: (tags: string[]) => void;
  presets: { id: string; label: string; tags: string[] }[];
  disabled?: boolean;
}

/** Several versions (Check), with presets on top of the list. */
export function VersionPicker({ builds, selected, onChange, presets, disabled }: PickerProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const set = new Set(selected);
  const order = (tags: Iterable<string>) => builds.map(b => b.tag).filter(tag => new Set(tags).has(tag));
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between sm:w-auto" disabled={disabled || !builds.length}>
          <span>{t('versions.pickerLabel', { n: selected.length })}</span>
          <CaretDownIcon className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),24rem)] p-0">
        <VersionList
          builds={builds}
          multi
          isSelected={tag => set.has(tag)}
          onPick={tag => {
            const next = new Set(set);
            if (next.has(tag)) next.delete(tag);
            else next.add(tag);
            onChange(order(next));
          }}
          header={
            <div className="flex flex-wrap gap-1">
              {presets.map(p => (
                <Button
                  key={p.id}
                  type="button"
                  size="sm"
                  variant={same(p.tags, selected) ? 'secondary' : 'ghost'}
                  className="h-7 px-2 text-xs"
                  onClick={() => onChange(order(p.tags))}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          }
        />
      </PopoverContent>
    </Popover>
  );
}
