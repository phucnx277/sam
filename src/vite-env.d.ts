/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __COMMIT_HASH__: string;

interface ImportMetaEnv {
  readonly VITE_METERED_PUB_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
