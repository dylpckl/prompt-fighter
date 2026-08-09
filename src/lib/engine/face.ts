// Display-only aggregation of the eight raw stats into the four bars the card
// shows. The sim never reads these. Spirit is the peak of the four spirit stats,
// labeled by which one — because the spirit four spend a FIXED 20-pt budget, so
// their sum is constant across fighters and useless; the peak (and its name) vary.
import type { Stats, SpiritKey } from './types'
import { STAT_MAX, SPIRIT_MAX } from './types'

export interface FaceBar {
  key: 'power' | 'speed' | 'toughness' | 'spirit'
  label: string
  value: number
  max: number
}

const SPIRIT_LABEL: Record<SpiritKey, string> = {
  cha: 'Presence', wil: 'Resolve', arc: 'Weirdness', luk: 'Fate',
}

export function faceBars(stats: Stats): FaceBar[] {
  const keys: SpiritKey[] = ['cha', 'wil', 'arc', 'luk']
  const peak = keys.reduce((best, k) => (stats[k] > stats[best] ? k : best), 'cha' as SpiritKey)
  return [
    { key: 'power', label: 'Power', value: stats.atk, max: STAT_MAX },
    { key: 'speed', label: 'Speed', value: stats.spd, max: STAT_MAX },
    { key: 'toughness', label: 'Toughness', value: stats.hp + stats.def, max: STAT_MAX * 2 },
    { key: 'spirit', label: SPIRIT_LABEL[peak], value: stats[peak], max: SPIRIT_MAX },
  ]
}
