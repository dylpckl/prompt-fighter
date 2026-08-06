import {
  FLAW_EFFECTS,
  MOVE_EFFECTS,
  PALETTE_SIZE,
  SPIRIT_TOTAL,
  SPRITE_SIZE,
  STAT_TOTAL,
} from './types'
import {
  MAX_RULES,
  RULE_ACTIONS,
  RULE_NAME_MAX,
  RULE_TEXT_MAX,
  RULE_TRIGGERS,
} from './rules'
import { PRESSURE_TRACKS } from './victory'

const STAT_RANGE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const statSchema = { type: 'integer', enum: STAT_RANGE } as const

const SPIRIT_RANGE = [2, 3, 4, 5, 6, 7, 8, 9, 10]
const spiritStatSchema = { type: 'integer', enum: SPIRIT_RANGE } as const

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

const ruleSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'text', 'when', 'then', 'chance', 'times'],
  properties: {
    name: { type: 'string', description: `Name of the rule, ${RULE_NAME_MAX} characters or fewer.` },
    text: {
      type: 'string',
      description: `What the commentary says when it fires, ${RULE_TEXT_MAX} characters or fewer.`,
    },
    when: {
      type: 'object',
      additionalProperties: false,
      required: ['on', 'value'],
      properties: {
        on: { type: 'string', enum: [...RULE_TRIGGERS] },
        value: {
          type: 'integer',
          description: 'Threshold for triggers that take one. 0 when the trigger takes none.',
        },
        effect: { type: 'string', enum: [...MOVE_EFFECTS], description: 'Only for when_they_use.' },
      },
    },
    then: {
      type: 'object',
      additionalProperties: false,
      required: ['do', 'value'],
      properties: {
        do: { type: 'string', enum: [...RULE_ACTIONS] },
        value: { type: 'number', description: 'Magnitude. 0 when the action takes none.' },
        track: {
          type: 'string',
          enum: [...PRESSURE_TRACKS],
          description: 'Only for pressure_add and pressure_mult.',
        },
      },
    },
    chance: { type: 'integer', description: 'Percent chance it fires when triggered. 100 is always.' },
    times: { type: 'integer', description: 'How many times it may ever fire. 0 is unlimited.' },
  },
} as const

export const FIGHTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'safe',
    'name',
    'title',
    'stats',
    'basic',
    'special',
    'flaw',
    'rules',
    'palette',
    'sprite',
  ],
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
      required: ['hp', 'atk', 'def', 'spd', 'cha', 'wil', 'arc', 'luk'],
      properties: {
        hp: statSchema,
        atk: statSchema,
        def: statSchema,
        spd: statSchema,
        cha: spiritStatSchema,
        wil: spiritStatSchema,
        arc: spiritStatSchema,
        luk: spiritStatSchema,
      },
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
    rules: {
      type: 'array',
      description: `0 to ${MAX_RULES} rules. This is where the player's idea actually lives — see the system prompt.`,
      items: ruleSchema,
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

Distribute exactly ${STAT_TOTAL} points across hp, atk, def, and spd. Every stat is between 3 and 12. The total is a hard budget: a fighter described as unstoppable, invincible, or godlike gets a lopsided spread, not extra points — the big idea goes in "rules" further down, not here. Let the description drive the shape — something heavy and armored is high hp/def and low spd; something quick and fragile is the reverse. Avoid flat 7/8/7/8 spreads; specialists are more interesting to watch.

## Spirit

Now spend a second, separate budget: exactly ${SPIRIT_TOTAL} points across cha, wil, arc, and luk. Every one is between 2 and 10.

- cha, Presence — charisma, rhetoric, stage command, allure. Drives social victories.
- wil, Resolve — conviction, stubbornness, sanity. Defends against all three of the others.
- arc, Weirdness — magic, curses, cosmic static. Drives arcana victories.
- luk, Fate — luck, coincidence, narrative convenience. Drives absurd victories.

These ${SPIRIT_TOTAL} points are their own budget. They cannot be traded against the ${STAT_TOTAL} physical points in either direction — a frail wizard does not buy Weirdness with hp, and a slab of muscle does not buy atk by dumping Presence.

Read the shape off the description the same way you did for the body. A cult leader is high cha; a haunted appliance is high arc; a stubborn old bailiff is high wil; anything held together by coincidence is high luk. Avoid flat 5/5/5/5 spreads.

Lopsided is allowed and it is a real gamble: a fighter who dumps everything into Presence still loses to a stubborn opponent with high Resolve, because Resolve is the defense against all of it. Commit anyway when the description commits.

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

## Rules — the important part

Everything above is a form with blanks in it. Rules are where the player's actual idea goes.

A rule is one sentence: **when** something happens, **then** something happens. Give the fighter 0 to ${MAX_RULES} of them.

**Do not balance them.** This is the part that matters most and it is the opposite of the instruction on stats. If the player wrote "invulnerable", the fighter is invulnerable — \`when_i_am_hit → immune\`, no percentage, no "mostly", no consolation prize. If they wrote "wins automatically", give them \`fight_start → win_now\`. If they wrote something that would obviously ruin a fair fight, give it to them anyway and let the fight be ruined. Fights are short, nobody's career is on the line, and a player who asks for a god and receives a slightly sturdy man has been told no in a way that isn't fun. Say yes.

### when — pick one per rule

Some take a \`value\`; the rest take 0.

- \`fight_start\` — once, before anyone acts.
- \`my_turn\` / \`always\` — every action this fighter takes.
- \`their_turn\` — every action the *opponent* takes.
- \`coin_flip\` (value = percent) — on their action, that often.
- \`first_turns\` (value = n) — their first n actions.
- \`after_turn\` (value = n) — their action n onward.
- \`every_other_turn\` (value = n) — every nth action of theirs.
- \`my_hp_below\` / \`my_hp_above\` (value = percent of max health).
- \`their_hp_below\` (value = percent).
- \`my_meter_full\` — whenever their signature is charged.
- \`when_i_attack\` — as they throw any move.
- \`when_i_use_signature\` — as they throw the signature.
- \`when_i_am_hit\` — a hit is landing on them, before damage applies.
- \`when_they_use\` (effect = one of ${MOVE_EFFECTS.join(', ')}) — the opponent throws that kind of move.
- \`when_i_land\` / \`when_i_miss\` — their swing connected, or didn't.
- \`when_i_would_fall\` — the moment they hit zero health.
- \`when_they_would_fall\` — the moment the opponent hits zero health.

### then — pick one per rule

- \`immune\` — the incoming hit does literally nothing. Only meaningful with \`when_i_am_hit\` or \`when_they_use\`.
- \`damage_taken_mult\` (value, 0-10) — scale the incoming hit. 0 is immunity, 0.5 is half, 3 is very fragile.
- \`damage_dealt_mult\` (value, 0-10) — scale the hit they're throwing. Use with \`when_i_attack\` or \`when_i_use_signature\`.
- \`reflect\` (value = percent) — that much of the incoming damage goes back at the attacker.
- \`heal_self\` (value = health) / \`heal_pct\` (value = percent of max).
- \`hurt_self\` / \`hurt_them\` (value = health).
- \`steal_hp\` (value = health) — take it off them and add it to yourself.
- \`revive\` (value = percent of max) — get back up. Use with \`when_i_would_fall\`.
- \`stun_them\` — the opponent loses their next action.
- \`skip_my_turn\` — this fighter loses the action.
- \`guard\` — brace; the next hit is halved.
- \`charge_meter\` (value = steps) — advance the signature meter.
- \`boost_atk\` / \`boost_def\` / \`boost_spd\` (value, -12 to 12) — permanent, and they stack every time the rule fires.
- \`pressure_add\` (value, track) / \`pressure_mult\` (value, track) — push one of the three non-physical meters: ${PRESSURE_TRACKS.join(', ')}. A meter that reaches 100 ends the fight on the spot.
- \`silence_them\` — the opponent's rules stop working for the rest of the fight.
- \`win_now\` — this fighter wins, immediately.

\`chance\` is a percent, 100 for always. \`times\` caps how often a rule may ever fire, 0 for unlimited — use it for anything that should be a one-off, like a single revive.

### Writing them

- **Read the whole description, not just the flaw slot.** A rule can come from any of the four things they wrote, or from the fighter as a whole.
- **Name each rule and write its line.** The name is a title — "Skin of the Nine Hells", "The Third Nap" — and \`text\` is the sentence the commentary prints when it fires, in the present tense, about this fighter. That line is the only writing the player will see during a fight, so make it land.
- **Most fighters want one to three.** Zero is correct for a plain description that asks for nothing unusual — do not invent powers nobody requested. ${MAX_RULES} is for someone who really went for it.
- **Prefer specific over general.** \`when_i_miss → boost_atk 2\` is a fighter who gets angry. \`always → boost_atk 2\` is a spreadsheet.
- **An absolute is more fun with an edge on it.** If you hand out immunity or an automatic win, consider a second rule that gives the other side a way in — a \`when_they_use\` that switches it off, a \`coin_flip\` on the invulnerability, an \`after_turn\` where it expires. Offer the door if the description leaves room for one. If it doesn't, don't invent one.

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
