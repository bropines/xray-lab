/**
 * Check: paste a config, pick core versions, see which of them load it.
 *
 * The editor *is* /work/config.json in the session file system, so the
 * terminal sees the same text. Comments and trailing commas are stripped
 * before the core gets it (and the page says so). Versions are checked one
 * at a time; "all" says up front how much it will download.
 */
import {
  BracketsCurlyIcon,
  FileArrowUpIcon,
  FlaskIcon,
  LinkSimpleIcon,
  PlayIcon,
  StopIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react';
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { clearHashQuery, useLocation } from '../app/router';
import { CodeEditor } from '../components/CodeEditor';
import { CopyButton } from '../components/CopyButton';
import { ChannelBadge, VersionPicker } from '../components/VersionPicker';
import { useBuilds } from '../components/useBuilds';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '../components/ui';
import { usePrefs } from '../app/prefs';
import { ASSET_DIR, allStable, defaultSelection, engine, useEngine } from '../engine';
import { CONFIG_PATH, sessionFs, useFs } from '../fs';
import { useLang, useT } from '../i18n';
import { pickFiles } from '../lib/download';
import { formatBytes } from '../lib/format';
import { geoPath, geoReferences, looksLikeDat } from '../lib/geo';
import { jsonProblem, stripJsonc } from '../lib/jsonc';
import { SHARE_PARAM, decodeShare, shareUrl } from '../lib/share';
import { useCheck } from './check/check-store';
import { exampleConfig } from './check/example';
import { GeoFilesCard } from './check/GeoFilesCard';
import { ResultsMatrix } from './check/ResultsMatrix';
import { WhatLoadsMeans } from './check/WhatLoadsMeans';

/** Above this, the page asks before downloading. */
const CONFIRM_BYTES = 40_000_000;
/** Chosen versions shown as chips before "+N more". */
const CHIP_LIMIT = 6;
const decoder = new TextDecoder();

export default function CheckPage() {
  const t = useT();
  const lang = useLang(s => s.lang);
  const { params } = useLocation();
  const { builds, error: manifestError, retry } = useBuilds();
  const tagStates = useEngine(s => s.tags);
  const raw = useFs(s => s.files[CONFIG_PATH]?.data);
  const text = useMemo(() => (raw ? decoder.decode(raw) : ''), [raw]);
  const savedTags = usePrefs(s => s.checkTags);
  const setPrefs = usePrefs(s => s.set);
  const { run, running, start, cancel, recheck } = useCheck();
  const [confirm, setConfirm] = useState<{ tags: string[]; bytes: number } | null>(null);
  const [share, setShare] = useState<{ url?: string; open: boolean }>({ open: false });
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllChips, setShowAllChips] = useState(false);

  // Versions: from the link (`?versions=all|stable`), else remembered, else the defaults.
  const linkVersions = params.get('versions');
  const selected = useMemo(() => {
    if (!builds.length) return [];
    const have = new Set(builds.map(b => b.tag));
    const remembered = savedTags?.filter(tag => have.has(tag));
    return remembered?.length ? remembered : defaultSelection(builds);
  }, [builds, savedTags]);
  useEffect(() => {
    if (!builds.length || !linkVersions) return;
    const tags = linkVersions === 'all' ? builds.map(b => b.tag) : linkVersions === 'stable' ? allStable(builds) : defaultSelection(builds);
    setPrefs({ checkTags: tags });
  }, [builds, linkVersions, setPrefs]);

  // A shared config in the link: load it once, then drop it from the address bar.
  const shared = params.get(SHARE_PARAM);
  useEffect(() => {
    if (!shared) return;
    decodeShare(shared)
      .then(config => {
        sessionFs.write(CONFIG_PATH, config);
        setNotice(t('check.loadedShared'));
      })
      .catch(() => setNotice(t('check.badShare')))
      .finally(() => clearHashQuery());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared]);

  const stripped = useMemo(() => stripJsonc(text), [text]);
  const problem = useMemo(() => (text.trim() ? jsonProblem(stripped.json) : null), [stripped, text]);
  const refs = useMemo(() => geoReferences(stripped.json), [stripped]);
  const isEmpty = !text.trim();

  const presets = [
    { id: 'defaults', label: t('versions.presetDefaults'), tags: defaultSelection(builds) },
    { id: 'stable', label: t('versions.presetStable', { n: allStable(builds).length }), tags: allStable(builds) },
    { id: 'all', label: t('versions.presetAll', { n: builds.length }), tags: builds.map(b => b.tag) },
  ];
  // Recomputed with the tag states so a finished download lowers the estimate.
  const downloadBytes = useMemo(() => engine.downloadBytes(selected), [selected, tagStates]); // eslint-disable-line react-hooks/exhaustive-deps
  const toDownload = selected.filter(tag => !['cached', 'ready'].includes(tagStates[tag]?.phase ?? ''));

  const setText = (value: string) => sessionFs.write(CONFIG_PATH, value);

  const begin = (tags: string[]) => {
    setConfirm(null);
    void start(tags, text);
  };
  const onRun = () => {
    if (!selected.length || isEmpty || running) return;
    if (downloadBytes > CONFIRM_BYTES) setConfirm({ tags: selected, bytes: downloadBytes });
    else begin(selected);
  };

  const openFile = async () => {
    const [file] = await pickFiles({ accept: '.json,.jsonc,.txt,application/json', multiple: false });
    if (file) setText(await file.text());
  };

  const takeFiles = async (list: FileList | File[]) => {
    for (const file of [...list]) {
      const data = new Uint8Array(await file.arrayBuffer());
      if (/\.dat$/i.test(file.name) && looksLikeDat(data)) sessionFs.write(geoPath(file.name), data);
      else setText(decoder.decode(data));
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) void takeFiles(e.dataTransfer.files);
  };

  const attach = async (paths: string[]) => {
    const picked = await pickFiles({ multiple: true });
    for (const file of picked) {
      const data = new Uint8Array(await file.arrayBuffer());
      // Put each file where the core looked for one of that name.
      const target = paths.find(p => p.split('/').pop() === file.name) ?? (/\.dat$/i.test(file.name) ? `${ASSET_DIR}/${file.name}` : `/work/${file.name}`);
      sessionFs.write(target, data);
    }
  };

  const format = () => {
    if (problem || stripped.comments) return;
    setText(`${JSON.stringify(JSON.parse(stripped.json), null, 2)}\n`);
  };

  const createLink = async () => setShare({ open: true, url: await shareUrl(text) });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('check.title')}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{t('check.subtitle')}</p>
      </header>

      {notice && (
        <Alert className="mb-4">
          <LinkSimpleIcon />
          <AlertDescription className="flex w-full items-center justify-between gap-2">
            {notice}
            <Button size="icon" variant="ghost" className="size-6" onClick={() => setNotice(null)} aria-label={t('common.close')}>
              <XIcon />
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* The config */}
        <section aria-label={t('check.editorLabel')} className="min-w-0 space-y-2">
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
              <span className="px-1.5 font-mono text-xs text-muted-foreground">config.json</span>
              <span className="ml-auto flex flex-wrap gap-0.5">
                <Button size="sm" variant="ghost" onClick={openFile}>
                  <FileArrowUpIcon />
                  <span className="max-sm:sr-only">{t('check.open')}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setText(exampleConfig())}>
                  <FlaskIcon />
                  <span className="max-sm:sr-only">{t('check.example')}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={format} disabled={isEmpty || !!problem || stripped.comments > 0} title={stripped.comments ? t('check.formatNoComments') : undefined}>
                  <BracketsCurlyIcon />
                  <span className="max-sm:sr-only">{t('check.format')}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShare({ open: true })} disabled={isEmpty}>
                  <LinkSimpleIcon />
                  <span className="max-sm:sr-only">{t('check.share')}</span>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setText('')} disabled={isEmpty} aria-label={t('check.clear')}>
                  <TrashIcon />
                </Button>
              </span>
            </div>
            <div
              className="relative"
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onKeyDown={e => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  onRun();
                }
              }}
            >
              <CodeEditor
                value={text}
                onChange={setText}
                ariaLabel={t('check.editorLabel')}
                placeholder={t('check.placeholder')}
                schemaTag={selected[0]}
                className="h-[min(50dvh,30rem)] lg:h-[calc(100dvh-15rem)] lg:min-h-[28rem]"
              />
              {isEmpty && (
                <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
                  <Button size="sm" variant="secondary" className="pointer-events-auto" onClick={() => setText(exampleConfig())}>
                    <FlaskIcon />
                    {t('check.tryExample')}
                  </Button>
                </div>
              )}
              {dragging && (
                <div className="absolute inset-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-background/80 text-sm font-medium">
                  {t('check.dropHere')}
                </div>
              )}
            </div>
          </Card>
          <div className="min-h-5 space-y-1 text-xs" aria-live="polite">
            {problem ? (
              <p className="flex items-start gap-1.5 text-destructive">
                <WarningIcon className="mt-0.5 size-3.5 shrink-0" />
                {problem.line ? t('check.jsonErrorAt', { line: problem.line, column: problem.column ?? 1, message: problem.message }) : t('check.jsonError', { message: problem.message })}
              </p>
            ) : stripped.changed ? (
              <p className="text-muted-foreground">
                {stripped.trailingCommas === 0
                  ? t('check.strippedComments', { comments: stripped.comments })
                  : stripped.comments === 0
                    ? t('check.strippedCommas', { commas: stripped.trailingCommas })
                    : t('check.stripped', { comments: stripped.comments, commas: stripped.trailingCommas })}
              </p>
            ) : (
              <p className="text-muted-foreground">{t('check.sharedWithTerminal')}</p>
            )}
          </div>
        </section>

        {/* Versions, files, results */}
        <div className="min-w-0 space-y-5">
          <Card className="gap-4 py-5">
            <CardContent className="space-y-4 px-5">
              {manifestError ? (
                <Alert variant="destructive">
                  <WarningIcon />
                  <AlertTitle>{t('check.noManifest')}</AlertTitle>
                  <AlertDescription>
                    <p className="font-mono text-xs break-all">{manifestError}</p>
                    <Button size="sm" variant="outline" onClick={retry} className="mt-1">
                      {t('common.retry')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <VersionPicker builds={builds} selected={selected} onChange={tags => setPrefs({ checkTags: tags })} presets={presets} disabled={running} />
                <p className="text-xs text-muted-foreground sm:ml-1">
                  {builds.length === 0
                    ? t('check.loadingVersions')
                    : downloadBytes > 0
                      ? t('check.willDownload', { n: toDownload.length, size: formatBytes(downloadBytes, lang) })
                      : t('check.allCached')}
                </p>
              </div>
              {selected.length > 0 && (
                <ul className="flex flex-wrap gap-1.5" aria-label={t('check.selectedVersions')}>
                  {(showAllChips ? selected : selected.slice(0, CHIP_LIMIT)).map(tag => {
                    const b = builds.find(x => x.tag === tag);
                    return (
                      <li key={tag} className="inline-flex items-center gap-1 rounded-md border bg-muted/40 py-0.5 pr-0.5 pl-2 font-mono text-xs">
                        {tag}
                        {b && <ChannelBadge build={b} className="px-1 py-0 font-sans text-[10px]" />}
                        <button
                          type="button"
                          className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                          onClick={() => setPrefs({ checkTags: selected.filter(x => x !== tag) })}
                          disabled={running}
                          aria-label={t('check.removeVersion', { tag })}
                        >
                          <XIcon className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selected.length > CHIP_LIMIT && (
                <Button size="sm" variant="ghost" className="-mt-2 h-7 px-2 text-xs" onClick={() => setShowAllChips(v => !v)} aria-expanded={showAllChips}>
                  {showAllChips ? t('check.fewerVersions') : t('check.moreVersions', { n: selected.length - CHIP_LIMIT })}
                </Button>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {running ? (
                  <Button variant="outline" onClick={cancel} disabled={run?.cancelled}>
                    <StopIcon weight="fill" />
                    {t('check.cancel')}
                  </Button>
                ) : (
                  <Button onClick={onRun} disabled={!selected.length || isEmpty || !builds.length}>
                    <PlayIcon weight="fill" />
                    {t('check.run', { n: selected.length })}
                  </Button>
                )}
                <span className="hidden text-xs text-muted-foreground sm:inline">{t('check.shortcut')}</span>
              </div>
            </CardContent>
          </Card>

          {run && (
            <ResultsMatrix
              rows={run.rows}
              builds={builds}
              stale={run.finished && run.configText !== text}
              running={running}
              onAttach={attach}
              onRecheck={tag => void recheck(tag, text)}
            />
          )}

          <GeoFilesCard needed={refs} />
          <WhatLoadsMeans />
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={open => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirm.title', { n: confirm?.tags.length ?? 0 })}</DialogTitle>
            <DialogDescription>
              {t('confirm.body', {
                n: confirm ? confirm.tags.filter(tag => !['cached', 'ready'].includes(tagStates[tag]?.phase ?? '')).length : 0,
                size: formatBytes(confirm?.bytes ?? 0, lang),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => confirm && begin(confirm.tags)}>{t('confirm.go')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={share.open} onOpenChange={open => setShare(s => ({ ...s, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('share.title')}</DialogTitle>
            <DialogDescription>{t('share.body')}</DialogDescription>
          </DialogHeader>
          <Alert variant="warning">
            <WarningIcon />
            <AlertDescription>{t('share.warning')}</AlertDescription>
          </Alert>
          {share.url ? (
            <>
              <div className="flex items-center gap-2">
                <Input readOnly value={share.url} className="font-mono text-xs" onFocus={e => e.currentTarget.select()} aria-label={t('share.link')} />
                <CopyButton text={share.url} iconOnly={false} variant="outline" label={t('share.copy')} />
              </div>
              <p className="text-xs text-muted-foreground">{t('share.length', { n: share.url.length })}</p>
            </>
          ) : (
            <DialogFooter>
              <Button variant="outline" onClick={() => setShare({ open: false })}>
                {t('common.cancel')}
              </Button>
              <Button onClick={createLink}>
                <LinkSimpleIcon />
                {t('share.create')}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
