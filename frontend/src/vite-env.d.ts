/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_AAIS_WS_URL?: string;
  readonly VITE_AAIS_WS_PATH?: string;
  readonly VITE_AAIS_WS_ENABLED?: string;
  readonly VITE_AMPLIFY_AUTH?: string;
  readonly VITE_ROUTER_BASENAME?: string;
  readonly VITE_APP_BASE?: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
