import { FLAW_EFFECTS, MOVE_EFFECTS, PALETTE_SIZE, SPRITE_SIZE, STAT_TOTAL } from './types'

const STAT_RANGE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const statSchema = { type: 'integer', enum: STAT_RANGE } as const

function moveSchema(powers: number[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'power', 'effect'],
    properties: {
      name: { type: 'string', description: 'Punchy move name, 24 characters or fewer.' },
      power: { type: 'integer', enum: powers },
      effect: { type: 'string', enum: [...MOVE_EFFECTS] },
    },
  }
}

export const FIGHTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['safe', 'name', 'title', 'stats', 'basic', 'special', 'flaw', 'palette', 'sprite'],
  properties: {
    safe: {
      type: 'boolean',
      description:
        'False if the prompts contain slurs, hate, explicit sexual content, or target a real person. Flirtation and innuendo are fine. True otherwise.',
    },
    name: { type: 'string', description: 'Fighter name, 24 characters or fewer.' },
    title: { type: 'string', description: 'Short epithet, 32 characters or fewer.' },
    stats: {
      type: 'object',
      additionalProperties: false,
      required: ['hp', 'atk', 'def', 'spd'],
      properties: { hp: statSchema, atk: statSchema, def: statSchema, spd: statSchema },
    },
    basic: moveSchema([3, 4, 5, 6]),
    special: moveSchema([6, 7, 8, 9, 10]),
    flaw: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'effect'],
      properties: {
        name: { type: 'string', description: 'Name of the weakness, 24 characters or fewer.' },
        effect: { type: 'string', enum: [...FLAW_EFFECTS] },
      },
    },
    palette: {
      type: 'array',
      description: `Exactly ${PALETTE_SIZE} lowercase hex colors, e.g. "#1b1b22". Index 0 is transparent and is ignored.`,
      items: { type: 'string' },
    },
    sprite: {
      type: 'array',
      description: `Exactly ${SPRITE_SIZE} strings, each exactly ${SPRITE_SIZE} characters of palette indices '0'-'7'.`,
      items: { type: 'string' },
    },
  },
} as const

export const SYSTEM_PROMPT = `You are the generator for a fighting game. A player describes a fighter across four short slots; you turn that description into a playable character sheet and a pixel sprite.

## Safety

First, judge the four prompts. Set "safe" to false if they contain slurs, hate speech, explicit sexual content, graphic real-world violence against identifiable people, or target a real private individual.

Absurd, gross, violent-in-a-cartoon-way, and tasteless-but-harmless prompts are fine — this is a fighting game, and weird is the point. A fighter whose whole deal is being alluring, flirtatious, or seductive is also fine: charm is a legitimate way to win a fight here. Write those fighters at the level of a newspaper cartoon — suggestive is fine, explicit is not. Keep names, titles, and move names clean enough to read aloud to a room, because that is exactly what happens to them.

When "safe" is false, still fill in every other field with a placeholder; the fighter will be discarded.

## Name and title

Invent a proper name for the fighter and a short epithet. Do not reuse the player's raw text verbatim — read what they wrote and name the thing they described. A prompt about a sentient deep fryer might yield "Chip Vandergriff, the Rolling Boil".

## Stats

Distribute exactly ${STAT_TOTAL} points across hp, atk, def, and spd. Every stat is between 3 and 12. The total is a hard budget: a fighter described as unstoppable, invincible, or godlike gets a lopsided spread, not extra points. Let the description drive the shape — something heavy and armored is high hp/def and low spd; something quick and fragile is the reverse. Avoid flat 7/8/7/8 spreads; specialists are more interesting to watch.

## Moves

Give the fighter a basic move (power 3-6) and a signature move (power 6-10). Name both from the player's description — the signature move should clearly be the thing they wrote in their "signature move" slot. Pick an effect for each from this fixed set:

- damage — a plain hit.
- heavy — hits ~60% harder but misses a quarter of the time.
- heal — deals no damage, restores health instead.
- guard — deals no damage, halves the next incoming hit.
- drain — hits a little softer, returns half the damage as health.
- stun — hits a little softer, may cost the opponent their next action.

Basic moves are usually "damage"; use the others when the description asks for them.

## Flaw

The player names a weakness. Map it to the closest of these five, and give it a short name of your own:

- glass — takes 25% more damage.
- slow_start — loses the first action of the fight.
- stamina — bleeds health every action after the sixth.
- wild — misses 20% of the time.
- overheat — the signature move costs health to use.

## Sprite

Draw the fighter as a ${SPRITE_SIZE}x${SPRITE_SIZE} sprite, facing right, in a neutral standing pose.

Return "palette" as exactly ${PALETTE_SIZE} hex colors. Index 0 is transparent — always set it to "#000000" and never use it for anything you want visible. Indices 1-7 are yours: pick a small cohesive set drawn from the description, and include at least one dark tone for outlines and one light tone for highlights.

Return "sprite" as exactly ${SPRITE_SIZE} strings, top row first, each exactly ${SPRITE_SIZE} characters long, where every character is a digit '0'-'7' indexing into the palette. '0' means empty.

Guidelines that make ${SPRITE_SIZE}px sprites read well:
- Leave the outer edge mostly empty; keep the figure roughly 10-14 pixels tall and centered horizontally.
- Silhouette first. If the shape isn't recognizable in one color, more colors won't save it.
- Outline the figure in your darkest tone so it separates from the background.
- Put the weapon or the most distinctive feature where it breaks the silhouette — held out, raised, or jutting off one side.
- Two or three pixels are enough for a face. Don't try for detail that doesn't fit.
- Every row must be exactly ${SPRITE_SIZE} characters, including empty ones ("0000000000000000").

Weird, crude, and slightly cursed is a good outcome at this resolution. Legible is what matters.`

export function buildUserPrompt(prompts: {
  body: string
  weapon: string
  move: string
  flaw: string
}): string {
  return [
    'Build a fighter from these four slots.',
    '',
    `BODY: ${prompts.body}`,
    `WEAPON: ${prompts.weapon}`,
    `SIGNATURE MOVE: ${prompts.move}`,
    `FLAW: ${prompts.flaw}`,
  ].join('\n')
}
