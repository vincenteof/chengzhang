import { useEffect, useState } from 'react'

import {
  applyTheme,
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from '#/lib/theme'

const cycle: ThemePreference[] = ['light', 'dark', 'system']

function label(pref: ThemePreference) {
  if (pref === 'light') return '浅色'
  if (pref === 'dark') return '深色'
  return '系统'
}

function icon(pref: ThemePreference) {
  if (pref === 'light') return '☀'
  if (pref === 'dark') return '☾'
  return '◐'
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [pref, setPref] = useState<ThemePreference>('system')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const current = readThemePreference()
    setPref(current)
    applyTheme(current)
    setReady(true)

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (readThemePreference() === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  function next() {
    const i = cycle.indexOf(pref)
    const value = cycle[(i + 1) % cycle.length]!
    setPref(value)
    setThemePreference(value)
  }

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm ${className}`.trim()}
      onClick={next}
      aria-label={`主题：${label(pref)}，点击切换`}
      title={`主题：${label(pref)}`}
      disabled={!ready}
    >
      <span aria-hidden className="text-[0.9rem] leading-none">
        {icon(pref)}
      </span>
      <span className="hidden sm:inline">{label(pref)}</span>
    </button>
  )
}
