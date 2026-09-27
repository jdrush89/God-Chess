/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
