export type ThemePreference = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'cz-theme'

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? getSystemTheme() : pref
}

export function readThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

export function applyTheme(pref: ThemePreference) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(pref)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.dataset.theme = pref
  document.documentElement.style.colorScheme = resolved
}

export function setThemePreference(pref: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  applyTheme(pref)
}
