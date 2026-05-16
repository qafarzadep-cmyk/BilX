export const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || 'https://bilx.org'

export function appUrl(path = '/') {
  return new URL(path, APP_ORIGIN).toString()
}
