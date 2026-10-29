# Xray Lab

**The real Xray-core in your browser.** Check a config on several core versions at once, use the `xray` command line in a terminal, make keys and certificates — all on your device, nothing uploaded.

**Live:** https://bropines.github.io/xray-lab/ · [Русская версия](README.ru.md)

The engine is [xray-wasm](https://github.com/bropines/xray-wasm): Xray-core's own source, unmodified, compiled to WebAssembly once per release. When this page says a config loads, it is the official binary of that release that loaded it.

## What it does

### Check
Paste, open or drop a config, pick core versions, press **Check**.

- Each version answers like `xray run -test` on a server: **Loads**, **Refused** (with the core's own message, copyable), **Inconclusive** (it stopped looking for a file the page did not have — attach it or fetch it, then check again), **Crashed**, **Timed out**, **Unavailable**.
- Versions are grouped as Stable / Pre-release / Withdrawn, newest first, with search. The default set is the newest stable, v26.7.28 (what Remnawave nodes run) and v26.3.27 (the oldest build). "All stable" and "All" say up front how many megabytes they will download; versions are checked one at a time, with progress, and can be cancelled.
- Comments and trailing commas are stripped before the core sees the config (the page says what it removed; line numbers do not move).
- `geoip.dat` / `geosite.dat`: upload them, or fetch them from [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat) through jsDelivr.
- The editor suggests keys and values from the JSON Schema of the chosen version ([xray-schema](https://github.com/bropines/xray-schema)).
- **Share** (only when you press it) puts the config, compressed, into the link's `#fragment` — with a warning that any keys inside travel with the link.

What "Loads" does **not** prove: anything that only happens when the core starts (ports, interfaces, DNS, reaching a server), and checks that depend on the OS — the browser build runs as `GOOS=js`, so e.g. the Linux/Windows checks of a tun inbound are skipped and the result says so.

### Terminal
A shell with `xray` installed (xterm.js). `xray` runs the chosen version, `xray@26.7.28 …` a specific one. History, Tab completion of commands, flags, files and versions, `> file` redirection, and builtins: `help ls cat edit rm cp mv cd pwd echo history clear use versions upload download`. The file system is shared with Check: `xray run -test -c config.json` runs on what you pasted. Works on a phone, with an on-screen row for Tab, arrows and Ctrl+C.

### Tools
Forms over the CLI, each showing the exact command it ran: REALITY keys (`x25519`), WireGuard keys (`wg`), UUID (random or `uuid -i`), VLESS Encryption (`vlessenc`), ML-DSA-65 / ML-KEM-768, self-signed TLS certificates (`tls cert`, files to download), and a shortcut to check a config on every version.

English and Russian, light/dark/system theme, keyboard accessible, mobile first.

## Privacy

Everything runs in your browser tab. There is no backend, no analytics, no accounts. The only requests the page makes are for the core binaries (from xray-wasm's GitHub Pages), the config schemas (jsDelivr) and — only if you ask — geo files (jsDelivr / raw.githubusercontent.com). None of them carries your config.

Small files of the session (such as `config.json`) are kept in the browser's local storage so a reload keeps them; downloaded cores are kept in Cache Storage. About → "Remove downloaded cores" clears the latter.

## How it works

```
 XTLS/Xray-core (release tag)
        │  go build, GOOS=js GOARCH=wasm, unmodified source
        ▼
 xray-wasm release ── manifest.json, wasm_exec.js, <tag>.xray.wasm.gz (~12 MB each)
        │  served by bropines.github.io/xray-wasm (CORS: *)
        ▼
 this page ── fetch once ─▶ Cache Storage (keyed by sha256)
        │
        ▼
 Web Worker: Go runtime + xray ◀── config / CLI args + in-memory files
        │
        └──▶ verdict, stdout/stderr, files the command wrote
```

All calls into the library go through one module, `src/engine/` (typed from the library's contract, with a clearly marked fake for tests). It adds per-version download state, one call at a time, cancellable downloads and the cache.

## Local development

Requires [Bun](https://bun.sh) 1.3.

```sh
bun install
bun run dev          # http://localhost:5199/xray-lab/ — cores from xray-wasm's Pages
bun run dev:fake     # no cores at all: a fake engine (results are made up, the UI says so)
bun run dev:local    # cores from ../xray-wasm/dist-wasm (a local build of the library)
```

To work against a local checkout of the library itself: `bun add ../xray-wasm` (and `bun add <release tarball URL>` to go back).

Checks — all four must pass:

```sh
bunx tsc --noEmit
bun run lint
bun test
bun run build && bun run preview   # http://localhost:4199/xray-lab/
```

Build variables:

| Variable | Default | Meaning |
|---|---|---|
| `VITE_XRAY_WASM_BASE` | `https://bropines.github.io/xray-wasm/` | Folder holding the library's `manifest.json` (URL or `./path`). |
| `VITE_FAKE_ENGINE` | unset | `1` builds the fake engine instead of xray-wasm. |

## Deploy

`.github/workflows/pages.yml` runs on every push to `main` (and by hand): install, typecheck, lint, test, build, publish to GitHub Pages. In the repository settings, set **Pages → Source: GitHub Actions**.

Repository variables (optional):

- `XRAY_WASM_RELEASE=latest` — build with the newest xray-wasm release instead of the pinned one (a manual run can choose too);
- `XRAY_WASM_BASE` — load cores from another URL, or `self` to copy the release's cores (`manifest.json`, `wasm_exec.js`, `*.xray.wasm.gz`) into the site under `./xray-wasm/`.

## Updating to a new xray-wasm release

One line in `package.json`:

```json
"xray-wasm": "https://github.com/bropines/xray-wasm/releases/download/v0.2.0/xray-wasm-0.2.0.tgz"
```

then `bun install`, run the checks, commit. New Xray releases need nothing here: the version list comes from the library's manifest.

## Credits

- [Xray-core](https://github.com/XTLS/Xray-core) by Project X (XTLS) — MPL-2.0. The binaries this site runs are Xray-core built by [xray-wasm](https://github.com/bropines/xray-wasm); they stay under MPL-2.0.
- [xray-schema](https://github.com/bropines/xray-schema) — the per-version config schemas behind the suggestions.
- [xterm.js](https://xtermjs.org/), [CodeMirror](https://codemirror.net/), [shadcn/ui](https://ui.shadcn.com/), [Radix](https://www.radix-ui.com/), [Phosphor Icons](https://phosphoricons.com/), [Geist](https://vercel.com/font), [Loyalsoldier/v2ray-rules-dat](https://github.com/Loyalsoldier/v2ray-rules-dat).
- Prior art: [mmmray/xray-online](https://github.com/mmmray/xray-online) showed early that an Xray config validator can run in the browser, from a patched fork of the core. Xray Lab takes the same idea further with unmodified releases, many versions side by side and the full CLI.

## License

The site's code is [MIT](LICENSE). Xray-core and the binaries built from it are MPL-2.0.
