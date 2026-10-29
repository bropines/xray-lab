/**
 * The two geo files: attached or not, and two ways to attach them.
 *
 * They go into the session file system under /usr/share/xray, which is where
 * the core looks (XRAY_LOCATION_ASSET), so the terminal's
 * `xray run -test -c config.json` sees them too.
 */
import { CheckCircleIcon, CloudArrowDownIcon, GlobeHemisphereWestIcon, TrashIcon, UploadSimpleIcon, XIcon } from '@phosphor-icons/react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress } from '../../components/ui';
import { sessionFs, useFs } from '../../fs';
import { useLang, useT } from '../../i18n';
import { cn } from '../../lib/cn';
import { pickFiles } from '../../lib/download';
import { formatBytes, percent } from '../../lib/format';
import { GEO_FILES, GEO_SOURCE_NAME, GEO_SOURCE_URL, geoPath, looksLikeDat } from '../../lib/geo';
import { useGeo } from './geo-store';

interface Props {
  /** Which ones the config refers to (highlighted when missing). */
  needed: { geoip: boolean; geosite: boolean };
}

export function GeoFilesCard({ needed }: Props) {
  const t = useT();
  const lang = useLang(s => s.lang);
  const files = useFs(s => s.files);
  const fetching = useGeo(s => s.fetching);
  const errors = useGeo(s => s.errors);
  const { fetch: fetchOne, cancel, setError } = useGeo.getState();

  const upload = async () => {
    const picked = await pickFiles({ accept: '.dat', multiple: true });
    for (const f of picked) {
      const data = new Uint8Array(await f.arrayBuffer());
      const name = /geosite/i.test(f.name) ? 'geosite.dat' : /geoip/i.test(f.name) ? 'geoip.dat' : f.name;
      if (!looksLikeDat(data)) {
        setError(name, t('geo.notDat', { name: f.name }));
        continue;
      }
      sessionFs.write(geoPath(name), data);
    }
  };

  const anyNeededMissing = GEO_FILES.some(g => needed[g.name === 'geoip.dat' ? 'geoip' : 'geosite'] && !files[geoPath(g.name)]);

  return (
    <Card className={cn('gap-4 py-5', anyNeededMissing && 'border-warning/40')}>
      <CardHeader className="px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <GlobeHemisphereWestIcon className="size-5 text-muted-foreground" />
          {t('geo.title')}
        </CardTitle>
        <CardDescription>{anyNeededMissing ? t('geo.neededHint') : t('geo.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        <ul className="space-y-2">
          {GEO_FILES.map(g => {
            const file = files[geoPath(g.name)];
            const f = fetching[g.name];
            const isNeeded = needed[g.name === 'geoip.dat' ? 'geoip' : 'geosite'];
            return (
              <li key={g.name} className="rounded-md border px-3 py-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {file ? (
                    <CheckCircleIcon weight="fill" className="size-4 text-success" />
                  ) : (
                    <span className={cn('size-2 rounded-full', isNeeded ? 'bg-warning' : 'bg-muted-foreground/40')} aria-hidden />
                  )}
                  <span className="font-mono text-sm">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {file ? formatBytes(file.data.length, lang) : isNeeded ? t('geo.neededByConfig') : t('geo.notAttached')}
                  </span>
                  <span className="ml-auto flex gap-1">
                    {file ? (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => sessionFs.remove(geoPath(g.name))} aria-label={t('geo.remove', { name: g.name })}>
                        <TrashIcon />
                      </Button>
                    ) : f ? (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => cancel(g.name)}>
                        <XIcon />
                        {t('common.cancel')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7" onClick={() => void fetchOne(g.name)}>
                        <CloudArrowDownIcon />
                        {t('geo.fetch', { size: formatBytes(g.approxBytes, lang) })}
                      </Button>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1">{f && <Progress value={percent(f.loaded, f.total)} className="h-1" aria-label={t('geo.fetching', { name: g.name })} />}</div>
                {errors[g.name] && <p className="mt-1 text-xs text-destructive">{t('geo.failed', { error: errors[g.name] ?? '' })}</p>}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={upload}>
            <UploadSimpleIcon />
            {t('geo.upload')}
          </Button>
          <p className="text-xs text-muted-foreground">
            {t('geo.source')}{' '}
            <a className="underline underline-offset-2 hover:text-foreground" href={GEO_SOURCE_URL} target="_blank" rel="noreferrer">
              {GEO_SOURCE_NAME}
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
