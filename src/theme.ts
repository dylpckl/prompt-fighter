export const t = {
  bg: '#0b0b0c',
  panel: '#141417',
  panelHi: '#1c1c21',
  line: '#2a2a31',
  text: '#e9e9ec',
  dim: '#83838f',
  faint: '#55555f',
  accent: '#d9503c',
  good: '#5aa86f',
  warn: '#c9a227',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
} as const

export const label = {
  fontFamily: t.mono,
  fontSize: 11,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: t.dim,
} as const

export const panel = {
  background: t.panel,
  border: `1px solid ${t.line}`,
  borderRadius: 4,
} as const

export function button(variant: 'primary' | 'ghost' = 'primary'): React.CSSProperties {
  return {
    fontFamily: t.mono,
    fontSize: 13,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '14px 18px',
    borderRadius: 3,
    cursor: 'pointer',
    width: '100%',
    transition: 'background 120ms ease, border-color 120ms ease',
    ...(variant === 'primary'
      ? { background: t.accent, color: '#fff', border: `1px solid ${t.accent}` }
      : { background: 'transparent', color: t.dim, border: `1px solid ${t.line}` }),
  }
}
