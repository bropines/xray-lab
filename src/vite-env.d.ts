/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `1`: use the fake engine (src/engine/fake.ts) instead of xray-wasm. */
  readonly VITE_FAKE_ENGINE?: string;
  /** Folder holding the library's manifest.json; see src/engine/index.ts. */
  readonly VITE_XRAY_WASM_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** `<package version>-<git hash>`, from vite.config.ts. */
declare const __APP_VERSION__: string;
