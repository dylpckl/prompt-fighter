/**
 * What fraction of fights end on a capped meter, and how high the meters get
 * when they don't.
 *
 *   npx tsx scripts/pressure-rates.ts
 *
 * The constants in lib/engine/victory.ts are the kind that can only be set by
 * measurement — the accrual is a product of five terms and the fight length that
 * bounds it is itself an outcome of the physical sim, so there is no closed form
 * worth trusting. This is the harness those numbers were tuned against, checked
 * in so the next person retuning them starts from the same population rather
 * than a fresh guess about what a typical fighter looks like.
 *
 * `alpha` is the dial that matters: it shapes how lopsided a generated stat line
 * is. SYSTEM_PROMPT explicitly asks the model for specialists and against flat
 * spreads, so the middle two rows are the honest read on live fights and the
 * outer two are there to show the mechanic degrades sensibly at both extremes.
 */
import { makeRng } from '../src/lib/engine/rng'
import { simulate } from '../src/lib/engine/sim'
import {
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  SPIRIT_MAX,
  SPIRIT_MIN,
  SPIRIT_TOTAL,
  STAT_MAX,
  STAT_MIN,
  STAT_TOTAL,
} from '../src/lib/engine/types'
import type { FighterCore, FlawEffect, MoveEffect } from '../src/lib/engine/types'
import { PRESSURE_TRACKS } from '../src/lib/engine/victory'

/**
 * Spend `total` across four stats inside [min, max]. `alpha` shapes the result:
 * large is near-flat, small is a specialist with everything in one place.
 */
function spread(
  rng: () => number,
  min: number,
  max: number,
  total: number,
  alpha: number,
): number[] {
  const weights = [0, 1, 2, 3].map(() => Math.pow(rng() + 1e-9, 1 / alpha))
  const sum = weights.reduce((a, b) => a + b, 0)
  const spare = total - min * 4
  const want = weights.map((w) => (w / sum) * spare)
  const points = want.map(Math.floor)

  let left = spare - points.reduce((a, b) => a + b, 0)
  const byRemainder = want
    .map((w, i) => ({ frac: w - Math.floor(w), i }))
    .sort((p, q) => q.frac - p.frac)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    points[i] += 1
    left -= 1
  }

  const values = points.map((p) => p + min)
  // Anything over the ceiling goes to whoever still has room, so the budget is
  // spent exactly and no stat is ever illegal.
  for (let i = 0; i < values.length; i++) {
    while (values[i] > max) {
      const target = values.findIndex((v) => v < max)
      if (target < 0) break
      values[i] -= 1
      values[target] += 1
    }
  }
  return values
}

function randomFighter(rng: () => number, name: string, alpha: number): FighterCore {
  const body = spread(rng, STAT_MIN, STAT_MAX, STAT_TOTAL, alpha)
  const spirit = spread(rng, SPIRIT_MIN, SPIRIT_MAX, SPIRIT_TOTAL, alpha)
  const effect = (): MoveEffect => MOVE_EFFECTS[Math.floor(rng() * MOVE_EFFECTS.length)]
  const flaw = (): FlawEffect => FLAW_EFFECTS[Math.floor(rng() * FLAW_EFFECTS.length)]

  return {
    name,
    stats: {
      hp: body[0],
      atk: body[1],
      def: body[2],
      spd: body[3],
      cha: spirit[0],
      wil: spirit[1],
      arc: spirit[2],
      luk: spirit[3],
    },
    moves: [
      { name: 'Basic', power: 3 + Math.floor(rng() * 4), effect: effect() },
      { name: 'Special', power: 6 + Math.floor(rng() * 5), effect: effect() },
    ],
    flaw: { name: 'Flaw', effect: flaw() },
  }
}

interface Row {
  label: string
  ko: number
  decision: number
  pressure: number
  byTrack: Record<string, number>
  /** How full the fullest meter on the table got, bucketed by ten. */
  peak: number[]
  /** Beats in the fight, so a rate that ends bouts on turn two is visible. */
  lengths: number[]
  pressureLengths: number[]
  n: number
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((p, q) => p - q)
  return s[Math.floor(s.length / 2)]
}

function run(label: string, alpha: number, n: number, seed: number): Row {
  const rng = makeRng(seed)
  const row: Row = {
    label,
    ko: 0,
    decision: 0,
    pressure: 0,
    byTrack: { crowd: 0, hex: 0, fate: 0 },
    peak: new Array(10).fill(0),
    lengths: [],
    pressureLengths: [],
    n,
  }

  for (let i = 0; i < n; i++) {
    const a = randomFighter(rng, 'A', alpha)
    const b = randomFighter(rng, 'B', alpha)
    const result = simulate(a, b, Math.floor(rng() * 2 ** 31))

    if (result.pressure) {
      row.pressure += 1
      row.byTrack[result.pressure] += 1
      row.pressureLengths.push(result.log.length)
    } else if (result.decision) {
      row.decision += 1
    } else {
      row.ko += 1
    }
    row.lengths.push(result.log.length)

    const last = result.log[result.log.length - 1]
    let peak = 0
    for (const side of ['a', 'b'] as const) {
      for (const track of PRESSURE_TRACKS) peak = Math.max(peak, last.pressure[side][track])
    }
    row.peak[Math.min(9, Math.floor(peak / 10))] += 1
  }

  return row
}

/**
 * Does building for a track actually buy the win? Two fighters identical below
 * the neck, one committed to a track and one committed to Resolve, against a
 * range of opponents. If this doesn't move with the stat line, the mechanic is
 * noise rather than a build.
 */
function commitment(n: number, seed: number) {
  const rng = makeRng(seed)
  const lines = {
    'all-in Presence  (cha 10)': { cha: 10, wil: 2, arc: 4, luk: 4 },
    'committed        (cha 8)': { cha: 8, wil: 4, arc: 4, luk: 4 },
    'dabbling         (cha 6)': { cha: 6, wil: 6, arc: 4, luk: 4 },
    'flat backfill    (cha 5)': { cha: 5, wil: 5, arc: 5, luk: 5 },
    'stubborn         (wil 10)': { cha: 2, wil: 10, arc: 4, luk: 4 },
  }

  console.log('\ncommitment check — one built spirit line vs random opponents')
  console.log('spirit line                 wins  pressure wins  pressure losses')
  console.log('-'.repeat(66))

  for (const [label, spirit] of Object.entries(lines)) {
    let wins = 0
    let pressureWins = 0
    let pressureLosses = 0
    for (let i = 0; i < n; i++) {
      const a = randomFighter(rng, 'A', 1)
      const b = randomFighter(rng, 'B', 1)
      a.stats = { ...a.stats, ...spirit }
      const result = simulate(a, b, Math.floor(rng() * 2 ** 31))
      if (result.winner === 'a') wins += 1
      if (result.pressure) {
        if (result.winner === 'a') pressureWins += 1
        else pressureLosses += 1
      }
    }
    console.log(
      `${label.padEnd(26)}${pct(wins, n)}         ${pct(pressureWins, n)}           ${pct(pressureLosses, n)}`,
    )
  }
}

const pct = (x: number, n: number) => `${((x / n) * 100).toFixed(1)}%`.padStart(6)

const N = Number(process.env.N ?? 20000)
const POPULATIONS: Array<[string, number]> = [
  ['flat-ish   (alpha 3)', 3],
  ['moderate   (alpha 1)', 1],
  ['lopsided   (alpha 0.5)', 0.5],
  ['specialist (alpha 0.25)', 0.25],
]

console.log(`${N} fights per population\n`)
console.log(
  'population                    KO  decision  pressure |  crowd    hex   fate | beats  on cap',
)
console.log('-'.repeat(94))

const rows = POPULATIONS.map(([label, alpha], i) => run(label, alpha, N, 1000 + i * 77))
for (const r of rows) {
  console.log(
    `${r.label.padEnd(26)}${pct(r.ko, r.n)} ${pct(r.decision, r.n)} ${pct(r.pressure, r.n)}  |` +
      `${pct(r.byTrack.crowd, r.n)} ${pct(r.byTrack.hex, r.n)} ${pct(r.byTrack.fate, r.n)} |` +
      `${String(median(r.lengths)).padStart(6)}${String(median(r.pressureLengths)).padStart(8)}`,
  )
}

console.log('\nfullest meter on the table at the final beat, % of fights')
console.log(
  'population                 0-10  10-20  20-30  30-40  40-50  50-60  60-70  70-80  80-90   90+',
)
console.log('-'.repeat(101))
for (const r of rows) {
  console.log(r.label.padEnd(26) + r.peak.map((b) => pct(b, r.n)).join(' '))
}

commitment(4000, 555)
