/** Build-time version injected by Vite's `define` (see vite.config.ts); undefined in vitest. */
declare const __APP_VERSION__: string | undefined;

/** Deployed version: explicit APP_VERSION var wins, then the build-time value, then "dev". */
export const resolveAppVersion = (explicit?: string) =>
  explicit || (typeof __APP_VERSION__ === "string" && __APP_VERSION__) || "dev";
