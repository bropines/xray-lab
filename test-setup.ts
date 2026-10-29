/**
 * A DOM for `bun test` (bunfig.toml preloads this). Everything under
 * src/engine, src/terminal and src/lib is plain functions and needs none of
 * it; the few tests that render get happy-dom.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ width: 1280, height: 800, url: 'http://localhost/xray-lab/' });
