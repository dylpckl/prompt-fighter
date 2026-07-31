import { useEffect, useMemo, useRef } from 'react'
import type { Fighter, Side, Sprite as SpriteData, TurnEvent } from '@/lib/engine/types'
import { METER_TO_SPECIAL, SPRITE_SIZE } from '@/lib/engine/types'
import { METER_HELP } from '@/lib/explain'
import { Hint } from '@/components/Hint'
import { PRESSURE_THRESHOLD, PRESSURE_TRACKS } from '@/lib/engine/victory'
import type { PressureTrack } from '@/lib/engine/victory'
import { Sprite } from '@/components/Sprite'
import { StatBlock } from '@/components/StatBlock'
import { label, panel, t } from '@/theme'

const FIELD_HEIGHT = 240
const GROUND_HEIGHT = 76

/**
 * One side of the stage. The solo arena has the whole fighter row and draws the
 * stat panel from it; the broadcast only ever gets name/title/sprite off the
 * room poll, so `detail` is optional and the panel degrades to a nameplate
 * rather than the stage refusing to render.
 */
export interface StageSide {
  name: string
  title: string
  /** Null only when the fighter row went missing under a spectator. */
  sprite: SpriteData | null
  detail?: Fighter | null
}

export function stageSide(fighter: Fighter): StageSide {
  return {
    name: fighter.name,
    title: fighter.title,
    sprite: fighter.sprite,
    detail: fighter,
  }
}

interface Props {
  a: StageSide
  b: StageSide
  log: TurnEvent[]
  maxHp: Record<Side, number>
  /**
   * Which beat to draw, 0..log.length. This component owns no timer at all:
   * the solo arena counts it up on a setTimeout, the broadcast derives it from
   * the server clock, and both get the same picture out of the same number.
   */
  step: number
}

export function FightStage({ a, b, log, maxHp, step }: Props) {
  const clamped = Math.max(0, Math.min(log.length, step))
  const finished = clamped >= log.length

  const current = clamped > 0 ? log[clamped - 1] : null
  const hp = current ? current.hp : { a: maxHp.a, b: maxHp.b }
  const meter = current ? current.meter : { a: 0, b: 0 }

  const hitKeys = useMemo(() => {
    if (!current || current.damage <= 0) return { a: 0, b: 0 }
    return current.actor === 'a' ? { a: 0, b: clamped } : { a: clamped, b: 0 }
  }, [current, clamped])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* DOM order is phone order: the fight, then the stat blocks that scroll
          under it. Wide screens re-place these with grid areas. */}
      <div className="arena">
        <div className="arena__stage">
          <div className="arena__field" style={{ display: 'grid', gap: 10 }}>
            <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <HealthBar name={a.name} hp={hp.a} max={maxHp.a} meter={meter.a} side="a" />
                <HealthBar name={b.name} hp={hp.b} max={maxHp.b} meter={meter.b} side="b" />
              </div>

              {current && <PressureMeters a={current.pressure.a} b={current.pressure.b} />}

              <Battlefield a={a} b={b} hitKeys={hitKeys} idle={!finished} />
            </div>
          </div>

          <BattleLog entries={log.slice(0, clamped)} />
        </div>

        {/* Phone only — the flanking panels below cover the same ground once
            there's width for them. */}
        <div className="arena__stats-mobile">
          <FighterPanel side={a} />
          <FighterPanel side={b} />
        </div>

        <div className="arena__stat arena__stat--a">
          <FighterPanel side={a} />
        </div>

        <div className="arena__stat arena__stat--b">
          <FighterPanel side={b} />
        </div>
      </div>
    </div>
  )
}

const TRACK_LABELS: Record<PressureTrack, string> = {
  crowd: 'Crowd',
  hex: 'Hex',
  fate: 'Fate',
}

type Meters = TurnEvent['pressure'][Side]

/**
 * The three non-physical meters, mirrored inward like the health bars so each
 * side's track reads from its own edge.
 *
 * A track only appears once somebody has put a point on it. A fighter whose
 * cha/arc/luk sit on the spirit floor pushes nothing on that track ever, so a
 * row of six permanently empty bars would advertise a mechanic that isn't
 * running for them. Where a track is live it usually is from early on — Resolve
 * slows a meter rather than cancelling it — and the bar creeping up under a
 * fight nobody is winning physically is exactly the tell it should be.
 */
function PressureMeters({ a, b }: { a: Meters; b: Meters }) {
  const live = PRESSURE_TRACKS.filter((track) => a[track] > 0 || b[track] > 0)
  if (live.length === 0) return null

  return (
    <div style={{ display: 'grid', gap: 5 }}>
      {live.map((track) => (
        <div key={track} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MeterBar value={a[track]} align="right" />
          <span
            style={{
              ...label,
              fontSize: 9,
              color: t.faint,
              width: 46,
              flexShrink: 0,
              textAlign: 'center',
            }}
          >
            {TRACK_LABELS[track]}
          </span>
          <MeterBar value={b[track]} align="left" />
        </div>
      ))}
    </div>
  )
}

/** Fills from the outside in, so the two sides read as leaning on each other. */
function MeterBar({ value, align }: { value: number; align: 'left' | 'right' }) {
  const pct = Math.max(0, Math.min(100, (value / PRESSURE_THRESHOLD) * 100))
  return (
    <div
      style={{
        flex: 1,
        height: 4,
        background: t.panelHi,
        border: `1px solid ${t.line}`,
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          // A full meter is the thing that just ended the fight; it gets to
          // stop looking like the others.
          background: pct >= 100 ? t.warn : t.accent,
          transition: 'width 380ms cubic-bezier(0.2, 0.8, 0.3, 1), background 220ms ease',
        }}
      />
    </div>
  )
}

/**
 * The sprites stand on the ground line rather than floating in a flex row. The
 * inner width is capped so they close on each other instead of drifting to the
 * far edges once the shell goes wide.
 */
function Battlefield({
  a,
  b,
  hitKeys,
  idle,
}: {
  a: StageSide
  b: StageSide
  hitKeys: Record<Side, number>
  idle: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: FIELD_HEIGHT,
        overflow: 'hidden',
        border: `1px solid ${t.line}`,
        borderRadius: 3,
        background: `linear-gradient(180deg, #0e0e11 0%, ${t.panel} 100%)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND_HEIGHT,
          background: t.panelHi,
          borderTop: `1px solid ${t.line}`,
        }}
      />

      <div style={{ position: 'absolute', left: 0, right: 0, bottom: GROUND_HEIGHT }}>
        <div
          style={{
            width: '100%',
            maxWidth: 560,
            margin: '0 auto',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <StageSprite sprite={a.sprite} scale={7} hitKey={hitKeys.a} idle={idle} />
          <StageSprite sprite={b.sprite} scale={7} flip hitKey={hitKeys.b} idle={idle} />
        </div>
      </div>

    </div>
  )
}

/** A spectator can outlive a deleted fighter row; leave a hole, not a crash. */
function StageSprite({
  sprite,
  scale,
  flip,
  hitKey,
  idle,
}: {
  sprite: SpriteData | null
  scale: number
  flip?: boolean
  hitKey: number
  idle: boolean
}) {
  if (!sprite) {
    const size = SPRITE_SIZE * scale
    return <div style={{ width: size, height: size, border: `1px dashed ${t.line}` }} />
  }
  return <Sprite sprite={sprite} scale={scale} flip={flip} hitKey={hitKey} idle={idle} />
}

function FighterPanel({ side }: { side: StageSide }) {
  return (
    <div style={{ ...panel, padding: 14, display: 'grid', gap: 12 }}>
      <div>
        <p
          style={{
            margin: 0,
            fontSize: 15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {side.name}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: t.dim }}>{side.title}</p>
      </div>
      {side.detail ? (
        <StatBlock fighter={side.detail} />
      ) : (
        // Hidden stats are the point of the game; the room poll deliberately
        // ships names and sprites only.
        <p style={{ ...label, margin: 0, color: t.faint }}>Stats sealed</p>
      )}
    </div>
  )
}

/**
 * Appends as the replay runs and sticks to the bottom, so the fight reads as a
 * transcript building up rather than one line replacing another.
 */
function BattleLog({ entries }: { entries: TurnEvent[] }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries.length])

  return (
    <div className="arena__log" style={{ ...panel, padding: 14, display: 'grid', gap: 10 }}>
      <p style={{ ...label, margin: 0 }}>Battle log</p>

      {/* Fixed height, not a max: a log that grows walks everything below it
          down the screen as the fight goes on. */}
      <div
        ref={ref}
        className="arena__log-scroll"
        style={{
          overflowY: 'auto',
          display: 'grid',
          gap: 6,
          alignContent: 'start',
        }}
      >
        {entries.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: t.faint }}>Waiting for the bell.</p>
        ) : (
          entries.map((e, i) => {
            const last = i === entries.length - 1
            return (
              <div
                key={`${e.turn}-${i}`}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'baseline',
                  animation: last ? 'fadeUp 200ms ease-out' : undefined,
                }}
              >
                <span style={{ fontSize: 11, color: t.faint, width: 22, flexShrink: 0 }}>
                  {e.turn}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: last ? t.text : t.dim,
                  }}
                >
                  {e.text}
                </span>
                {e.damage > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      color: e.actor === 'a' ? t.good : t.accent,
                      marginLeft: 'auto',
                      flexShrink: 0,
                    }}
                  >
                    −{e.damage}
                  </span>
                )}
                {e.heal > 0 && (
                  <span
                    style={{ fontSize: 11, color: t.good, marginLeft: 'auto', flexShrink: 0 }}
                  >
                    +{e.heal}
                  </span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function HealthBar({
  name,
  hp,
  max,
  meter,
  side,
}: {
  name: string
  hp: number
  max: number
  meter: number
  side: Side
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100))
  const low = pct <= 30
  const alignRight = side === 'b'
  const charged = meter >= METER_TO_SPECIAL

  return (
    <div style={{ display: 'grid', gap: 6, justifyItems: alignRight ? 'end' : 'start' }}>
      <span
        style={{
          fontSize: 13,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '100%',
        }}
      >
        {name}
      </span>
      <div
        style={{
          width: '100%',
          height: 10,
          background: t.panelHi,
          border: `1px solid ${t.line}`,
          padding: 1,
          display: 'flex',
          justifyContent: alignRight ? 'flex-end' : 'flex-start',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: low ? t.accent : t.good,
            transition: 'width 380ms cubic-bezier(0.2, 0.8, 0.3, 1), background 220ms ease',
          }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexDirection: alignRight ? 'row-reverse' : 'row',
        }}
      >
        <span style={{ fontSize: 11, color: t.faint }}>
          {hp} / {max}
        </span>

        <Hint text={METER_HELP}>
          <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {Array.from({ length: METER_TO_SPECIAL }, (_, i) => (
              <span
                key={i}
                style={{
                  width: 10,
                  height: 5,
                  border: `1px solid ${i < meter ? (charged ? t.accent : t.warn) : t.line}`,
                  background: i < meter ? (charged ? t.accent : t.warn) : 'transparent',
                  transition: 'background 200ms ease, border-color 200ms ease',
                }}
              />
            ))}
          </span>
        </Hint>
      </div>
    </div>
  )
}
