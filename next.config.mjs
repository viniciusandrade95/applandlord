import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

/**
 * Lê informação do git em build-time com fallbacks seguros.
 * No Render o repositório é clonado com `.git`, por isso `git` funciona;
 * caso falhe (ex.: ambiente sem git), recorre a `RENDER_GIT_COMMIT`.
 */
function git(command, fallback) {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback
  } catch {
    return fallback
  }
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

const renderSha = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7)
const gitSha = git('git rev-parse --short HEAD', renderSha || 'dev')
const commitDate = git('git log -1 --format=%cI', '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_GIT_DATE: commitDate,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
}

export default nextConfig
