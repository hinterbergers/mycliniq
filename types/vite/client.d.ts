declare namespace NodeJS {
  interface ProcessEnv {}
}

interface ImportMetaEnv {
  readonly DEV?: boolean;
  readonly MODE?: string;
  readonly BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "vite/client" {
  export { ImportMetaEnv, ImportMeta };
}
