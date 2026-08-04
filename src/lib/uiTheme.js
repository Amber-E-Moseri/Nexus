export const UI_THEME_STORAGE_KEY = 'nexus_ui_theme'

export const UI_THEMES = [
  { value: 'nexus', title: 'Nexus', detail: 'The standard Nexus purple accent' },
  { value: 'purple', title: 'Vivid purple', detail: 'A brighter purple treatment across Nexus' },
  { value: 'green', title: 'Green', detail: 'A calm green treatment across Nexus' },
]

export function getUiTheme() {
  const stored = typeof window === 'undefined' ? null : window.localStorage.getItem(UI_THEME_STORAGE_KEY)
  return UI_THEMES.some((theme) => theme.value === stored) ? stored : 'nexus'
}

export function applyUiTheme(theme = getUiTheme()) {
  const nextTheme = UI_THEMES.some((option) => option.value === theme) ? theme : 'nexus'
  document.documentElement.dataset.nexusTheme = nextTheme
  window.localStorage.setItem(UI_THEME_STORAGE_KEY, nextTheme)
  return nextTheme
}
