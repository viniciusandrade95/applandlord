/**
 * Versão da aplicação, injetada em build-time por `next.config.mjs`.
 * Serve para confirmar, na interface, que versão/edição está a ser vista
 * e quando foi feita a alteração (data do commit).
 */
export const appVersion = {
  /** Versão semântica de `package.json` (ex.: "0.2.0"). */
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  /** Hash curto do commit em build (ex.: "a1b2c3d"). */
  sha: process.env.NEXT_PUBLIC_GIT_SHA ?? 'dev',
  /** Data ISO do commit — "quando foi feita a mudança". */
  commitDate: process.env.NEXT_PUBLIC_GIT_DATE ?? '',
  /** Momento ISO em que o build foi gerado. */
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? '',
}
