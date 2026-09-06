import { execFileSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else if (full.endsWith('.mjs')) {
      out.push(full)
    }
  }
  return out
}

const root = path.resolve('.output/server')
let files: string[]
try {
  files = walk(root)
} catch {
  console.error('missing .output/server — run pnpm build first')
  process.exit(1)
}

if (files.length === 0) {
  console.error('no .mjs files under .output/server')
  process.exit(1)
}

let failed = 0
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  } catch (error) {
    failed += 1
    const stderr =
      error && typeof error === 'object' && 'stderr' in error
        ? String((error as { stderr: Buffer }).stderr)
        : String(error)
    console.error(`invalid ESM: ${file}\n${stderr}`)
  }
}

if (failed > 0) {
  console.error(`verify-server-output: ${failed} invalid module(s)`)
  process.exit(1)
}

console.log(`verify-server-output: ${files.length} modules ok`)
