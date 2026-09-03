import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  resolveDatabaseUrl,
  resolveDbPoolMax,
  resolveMediaDir,
} from './env.server'

describe('resolveDatabaseUrl', () => {
  const prev = process.env.DATABASE_URL

  afterEach(() => {
    if (prev === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = prev
  })

  it('reads DATABASE_URL', () => {
    process.env.DATABASE_URL = 'postgresql://u@127.0.0.1:5432/db'
    expect(resolveDatabaseUrl()).toBe('postgresql://u@127.0.0.1:5432/db')
  })

  it('throws when missing', () => {
    delete process.env.DATABASE_URL
    expect(() => resolveDatabaseUrl()).toThrow(/DATABASE_URL/)
  })
})

describe('resolveDbPoolMax', () => {
  const prev = process.env.DB_POOL_MAX

  afterEach(() => {
    if (prev === undefined) delete process.env.DB_POOL_MAX
    else process.env.DB_POOL_MAX = prev
  })

  it('defaults to 10', () => {
    delete process.env.DB_POOL_MAX
    expect(resolveDbPoolMax()).toBe(10)
  })

  it('parses a positive integer', () => {
    process.env.DB_POOL_MAX = '4'
    expect(resolveDbPoolMax()).toBe(4)
  })
})

describe('resolveMediaDir', () => {
  const prev = process.env.MEDIA_DIR

  afterEach(() => {
    if (prev === undefined) delete process.env.MEDIA_DIR
    else process.env.MEDIA_DIR = prev
  })

  it('defaults to .tmp/media under cwd', () => {
    delete process.env.MEDIA_DIR
    expect(resolveMediaDir()).toBe(path.join(process.cwd(), '.tmp/media'))
  })

  it('resolves MEDIA_DIR', () => {
    process.env.MEDIA_DIR = '/data/media'
    expect(resolveMediaDir()).toBe(path.resolve('/data/media'))
  })
})
