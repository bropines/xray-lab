/**
 * Tools: forms over the `xray` CLI.
 *
 * Every tool runs the real command of the chosen core and shows it, exactly
 * as it ran (copyable, so the same thing can be done on a server), next to
 * what it printed. The values are also picked out of the output, one copy
 * button each; the raw output is always one click away.
 */
import {
  CertificateIcon,
  DownloadSimpleIcon,
  FingerprintIcon,
  FloppyDiskIcon,
  IdentificationCardIcon,
  KeyIcon,
  LockKeyIcon,
  PlayIcon,
  ShieldCheckIcon,
  StackIcon,
  WarningIcon,
} from '@phosphor-icons/react';
import { useState, type ComponentType, type FormEvent, type ReactNode } from 'react';
import { hrefOf } from '../app/router';
import { CodeBlock } from '../components/CodeBlock';
import { CopyButton } from '../components/CopyButton';
import { VersionSelect } from '../components/VersionPicker';
import { useBuilds, usePreferredTag } from '../components/useBuilds';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Input, Label, ToggleGroup, ToggleGroupItem } from '../components/ui';
import { WORK_DIR, engine, isCancelled, useEngine, type RunResult } from '../engine';
import { displayPath, resolvePath, sessionFs } from '../fs';
import { useLang, useT, type MessageKey } from '../i18n';
import { downloadBytes } from '../lib/download';
import { formatBytes, formatMs, percent } from '../lib/format';
import { formatCommand } from '../terminal/parser';
import { parseCertJson, parseFields, parseUuid, splitDomains } from '../tools/parse';

type RunState = { running: boolean; args?: string[]; result?: RunResult };

function useRunner(tag: string | undefined) {
  const [state, setState] = useState<RunState>({ running: false });
  const run = async (args: string[]) => {
    if (!tag) return;
    setState({ running: true, args });
    try {
      const result = await engine.run(args, { tag, files: {}, cwd: WORK_DIR, timeoutMs: 30_000 });
      setState({ running: false, args, result });
    } catch (e) {
      if (!isCancelled(e)) throw e;
      setState({ running: false });
    }
  };
  return { ...state, run };
}

type Runner = ReturnType<typeof useRunner>;

export default function ToolsPage() {
  const t = useT();
  const { builds } = useBuilds();
  const [tag, setTag] = usePreferredTag();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t('tools.title')}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t('tools.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('tools.core')}</span>
          <VersionSelect builds={builds} value={tag} onChange={setTag} />
        </div>
      </header>
      <DownloadStatus tag={tag} />
      <div className="grid items-start gap-5 md:grid-cols-2">
        <RealityTool tag={tag} />
        <UuidTool tag={tag} />
        <WireguardTool tag={tag} />
        <VlessEncTool tag={tag} />
        <PostQuantumTool tag={tag} />
        <CertTool tag={tag} />
        <VersionsShortcut />
      </div>
    </div>
  );
}

/** While the chosen core downloads: how far along. Space is kept so the cards do not jump. */
function DownloadStatus({ tag }: { tag?: string }) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const s = useEngine(st => (tag ? st.tags[tag] : undefined));
  const build = useEngine(st => st.builds.find(b => b.tag === tag));
  const downloading = s?.phase === 'downloading';
  return (
    <p className="mb-4 h-5 text-xs text-muted-foreground tabular-nums" aria-live="polite">
      {downloading
        ? t('tools.downloading', { tag: tag ?? '', pct: percent(s.loaded, s.total), loaded: formatBytes(s.loaded, lang), total: formatBytes(s.total, lang) })
        : s?.phase === 'ready' || s?.phase === 'cached'
          ? t('tools.ready', { tag: tag ?? '' })
          : build
            ? t('tools.firstRun', { size: formatBytes(build.gzip || build.size, lang) })
            : ''}
    </p>
  );
}

function ToolCard({ icon: Icon, title, description, children }: { icon: ComponentType<{ className?: string }>; title: MessageKey; description: MessageKey; children: ReactNode }) {
  const t = useT();
  return (
    <Card className="min-w-0 gap-4 py-5">
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-5 text-primary" />
          {t(title)}
        </CardTitle>
        <CardDescription>{t(description)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5">{children}</CardContent>
    </Card>
  );
}

function RunButton({ runner, tag, label }: { runner: Runner; tag?: string; label?: MessageKey }) {
  const t = useT();
  return (
    <Button type="submit" disabled={!tag || runner.running}>
      <PlayIcon weight="fill" className={runner.running ? 'animate-pulse' : undefined} />
      {t(label ?? 'tools.generate')}
    </Button>
  );
}

function Output({ runner, fields = true, extra }: { runner: Runner; fields?: boolean; extra?: ReactNode }) {
  const t = useT();
  const { args, result } = runner;
  if (!args) return null;
  const items = result && result.exitCode === 0 && fields ? parseFields(result.stdout) : [];
  return (
    <div className="space-y-3 border-t pt-4">
      <CodeBlock text={`xray ${formatCommand(args)}`} prefix="$ " copyLabel={t('tools.copyCommand')} />
      {!result && <p className="text-sm text-muted-foreground">{t('tools.running')}</p>}
      {result && result.exitCode !== 0 && (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <WarningIcon className="size-4" />
            {t('tools.failed', { code: result.exitCode })}
          </p>
          <CodeBlock text={(result.stderr || result.stdout).trim()} tone="error" />
        </div>
      )}
      {items.length > 0 && (
        <dl className="space-y-2">
          {items.map((item, i) =>
            item.kind === 'heading' ? (
              <dt key={i} className="pt-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {item.text}
              </dt>
            ) : (
              <div key={i} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="flex items-start gap-1">
                  <code className="min-w-0 flex-1 rounded bg-muted/50 px-2 py-1 font-mono text-[13px] break-all">
                    {item.value.length > 400 ? `${item.value.slice(0, 400)}…` : item.value}
                  </code>
                  <CopyButton text={item.value} label={t('tools.copyValue', { name: item.label })} />
                </dd>
              </div>
            ),
          )}
        </dl>
      )}
      {extra}
      {result && result.stdout && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t('tools.rawOutput', { time: formatMs(result.durationMs), tag: result.tag })}
          </summary>
          <CodeBlock className="mt-2" text={result.stdout.trimEnd()} />
        </details>
      )}
    </div>
  );
}

function OptionalInput({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <Input id={id} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="font-mono text-sm" autoComplete="off" spellCheck={false} />
    </div>
  );
}

const submit = (fn: () => void) => (e: FormEvent) => {
  e.preventDefault();
  fn();
};

function RealityTool({ tag }: { tag?: string }) {
  const t = useT();
  const runner = useRunner(tag);
  const [key, setKey] = useState('');
  return (
    <ToolCard icon={KeyIcon} title="tools.reality.title" description="tools.reality.desc">
      <form className="space-y-3" onSubmit={submit(() => runner.run(key.trim() ? ['x25519', '-i', key.trim()] : ['x25519']))}>
        <OptionalInput id="x25519-i" label={t('tools.reality.input')} value={key} onChange={setKey} placeholder={t('tools.optional')} />
        <RunButton runner={runner} tag={tag} label={key.trim() ? 'tools.derive' : 'tools.generate'} />
      </form>
      <Output runner={runner} />
      {runner.result?.exitCode === 0 && <p className="text-xs text-muted-foreground">{t('tools.reality.where')}</p>}
    </ToolCard>
  );
}

function WireguardTool({ tag }: { tag?: string }) {
  const t = useT();
  const runner = useRunner(tag);
  const [key, setKey] = useState('');
  return (
    <ToolCard icon={ShieldCheckIcon} title="tools.wg.title" description="tools.wg.desc">
      <form className="space-y-3" onSubmit={submit(() => runner.run(key.trim() ? ['wg', '-i', key.trim()] : ['wg']))}>
        <OptionalInput id="wg-i" label={t('tools.wg.input')} value={key} onChange={setKey} placeholder={t('tools.optional')} />
        <RunButton runner={runner} tag={tag} label={key.trim() ? 'tools.derive' : 'tools.generate'} />
      </form>
      <Output runner={runner} />
    </ToolCard>
  );
}

function UuidTool({ tag }: { tag?: string }) {
  const t = useT();
  const runner = useRunner(tag);
  const [mode, setMode] = useState<'random' | 'string'>('random');
  const [input, setInput] = useState('');
  const tooLong = mode === 'string' && input.length > 30;
  const uuid = runner.result?.exitCode === 0 ? parseUuid(runner.result.stdout) : null;
  return (
    <ToolCard icon={IdentificationCardIcon} title="tools.uuid.title" description="tools.uuid.desc">
      <form className="space-y-3" onSubmit={submit(() => runner.run(mode === 'string' ? ['uuid', '-i', input] : ['uuid']))}>
        <ToggleGroup type="single" variant="outline" value={mode} onValueChange={v => v && setMode(v as 'random' | 'string')} aria-label={t('tools.uuid.mode')}>
          <ToggleGroupItem value="random" className="px-3">{t('tools.uuid.random')}</ToggleGroupItem>
          <ToggleGroupItem value="string" className="px-3">{t('tools.uuid.fromString')}</ToggleGroupItem>
        </ToggleGroup>
        {mode === 'string' && (
          <div className="space-y-1.5">
            <OptionalInput id="uuid-i" label={t('tools.uuid.input')} value={input} onChange={setInput} placeholder="my name" />
            <p className={tooLong ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{t('tools.uuid.limit', { n: input.length })}</p>
          </div>
        )}
        <RunButton runner={runner} tag={tag} />
      </form>
      <Output
        runner={runner}
        fields={false}
        extra={
          uuid && (
            <div className="flex items-center gap-1">
              <code className="min-w-0 flex-1 rounded bg-muted/50 px-2 py-1.5 font-mono text-sm break-all">{uuid}</code>
              <CopyButton text={uuid} />
            </div>
          )
        }
      />
    </ToolCard>
  );
}

function VlessEncTool({ tag }: { tag?: string }) {
  const t = useT();
  const runner = useRunner(tag);
  return (
    <ToolCard icon={LockKeyIcon} title="tools.vlessenc.title" description="tools.vlessenc.desc">
      <form onSubmit={submit(() => runner.run(['vlessenc']))}>
        <RunButton runner={runner} tag={tag} />
      </form>
      <Output runner={runner} />
      {runner.result?.exitCode === 0 && <p className="text-xs text-muted-foreground">{t('tools.vlessenc.where')}</p>}
    </ToolCard>
  );
}

function PostQuantumTool({ tag }: { tag?: string }) {
  const t = useT();
  const runner = useRunner(tag);
  const [kind, setKind] = useState<'mldsa65' | 'mlkem768'>('mldsa65');
  const [seed, setSeed] = useState('');
  return (
    <ToolCard icon={FingerprintIcon} title="tools.pq.title" description="tools.pq.desc">
      <form className="space-y-3" onSubmit={submit(() => runner.run(seed.trim() ? [kind, '-i', seed.trim()] : [kind]))}>
        <ToggleGroup type="single" variant="outline" value={kind} onValueChange={v => v && setKind(v as typeof kind)} aria-label={t('tools.pq.kind')}>
          <ToggleGroupItem value="mldsa65" className="px-3 font-mono text-xs">ML-DSA-65</ToggleGroupItem>
          <ToggleGroupItem value="mlkem768" className="px-3 font-mono text-xs">ML-KEM-768</ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">{t(kind === 'mldsa65' ? 'tools.pq.mldsa' : 'tools.pq.mlkem')}</p>
        <OptionalInput id="pq-i" label={t('tools.pq.seed')} value={seed} onChange={setSeed} placeholder={t('tools.optional')} />
        <RunButton runner={runner} tag={tag} label={seed.trim() ? 'tools.derive' : 'tools.generate'} />
      </form>
      <Output runner={runner} />
    </ToolCard>
  );
}

function CertTool({ tag }: { tag?: string }) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const runner = useRunner(tag);
  const [domains, setDomains] = useState('example.com');
  const [name, setName] = useState('');
  const [org, setOrg] = useState('');
  const [days, setDays] = useState('90');
  const [ca, setCa] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);

  const args = () => {
    const a = ['tls', 'cert'];
    for (const d of splitDomains(domains)) a.push(`-domain=${d}`);
    if (name.trim()) a.push(`-name=${name.trim()}`);
    if (org.trim()) a.push(`-org=${org.trim()}`);
    const n = Math.max(1, Math.min(3650, Math.round(Number(days) || 90)));
    a.push(`-expire=${n * 24}h`);
    if (ca) a.push('-ca');
    a.push('-file=cert');
    return a;
  };

  const pem = runner.result?.exitCode === 0 ? parseCertJson(runner.result.stdout) : null;
  const files = Object.entries(runner.result?.files ?? {});

  return (
    <ToolCard icon={CertificateIcon} title="tools.cert.title" description="tools.cert.desc">
      <form
        className="space-y-3"
        onSubmit={submit(() => {
          setSaved([]);
          void runner.run(args());
        })}
      >
        <OptionalInput id="cert-domain" label={t('tools.cert.domains')} value={domains} onChange={setDomains} placeholder="example.com, www.example.com" />
        <div className="grid gap-3 sm:grid-cols-2">
          <OptionalInput id="cert-name" label={t('tools.cert.name')} value={name} onChange={setName} placeholder="Xray Inc" />
          <OptionalInput id="cert-org" label={t('tools.cert.org')} value={org} onChange={setOrg} placeholder="Xray Inc" />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-28 space-y-1.5">
            <Label htmlFor="cert-days" className="text-sm">
              {t('tools.cert.days')}
            </Label>
            <Input id="cert-days" type="number" min={1} max={3650} value={days} onChange={e => setDays(e.target.value)} />
          </div>
          <Label className="flex items-center gap-2 pb-2 text-sm font-normal">
            <Checkbox checked={ca} onCheckedChange={v => setCa(v === true)} />
            {t('tools.cert.ca')}
          </Label>
        </div>
        <RunButton runner={runner} tag={tag} />
      </form>
      <Output
        runner={runner}
        fields={false}
        extra={
          pem && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('tools.cert.certificate')}</p>
                <CodeBlock text={pem.certificate} maxHeight="10rem" />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t('tools.cert.key')}</p>
                <CodeBlock text={pem.key} maxHeight="10rem" />
              </div>
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map(([path, data]) => (
                    <Button key={path} size="sm" variant="outline" onClick={() => downloadBytes(path, data, 'application/x-pem-file')}>
                      <DownloadSimpleIcon />
                      {path.split('/').pop()} <span className="text-muted-foreground">{formatBytes(data.length, lang)}</span>
                    </Button>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSaved(files.map(([p, data]) => displayPath(sessionFs.write(resolvePath(p, WORK_DIR), data))))}
                  >
                    <FloppyDiskIcon />
                    {t('tools.cert.saveSession')}
                  </Button>
                </div>
              )}
              {saved.length > 0 && <p className="text-xs text-success">{t('tools.cert.saved', { files: saved.join(', ') })}</p>}
            </div>
          )
        }
      />
    </ToolCard>
  );
}

function VersionsShortcut() {
  const t = useT();
  return (
    <ToolCard icon={StackIcon} title="tools.versions.title" description="tools.versions.desc">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <a href={hrefOf('check', { versions: 'all' })}>{t('tools.versions.all')}</a>
        </Button>
        <Button asChild variant="outline">
          <a href={hrefOf('check', { versions: 'stable' })}>{t('tools.versions.stable')}</a>
        </Button>
      </div>
    </ToolCard>
  );
}
