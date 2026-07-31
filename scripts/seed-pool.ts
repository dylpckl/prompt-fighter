/**
 * Fills the ghost pool so the first real player has someone to fight.
 *
 *   npm run seed
 *
 * Each seed gets its own throwaway session id — nobody owns them, and it keeps
 * the run clear of the per-session rate limit.
 */
import { randomUUID } from 'node:crypto'

const URL_BASE = process.env.VITE_SUPABASE_URL
const PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

const SEEDS = [
  {
    body: 'A vending machine that gained sentience during a power surge',
    weapon: 'Cans fired at lethal velocity from its dispensing slot',
    move: 'Dumps its entire inventory in one deafening avalanche',
    flaw: 'Needs exact change before it will do anything',
  },
  {
    body: 'A knight in armor three sizes too big, held together with rope',
    weapon: 'A greatsword he can barely lift, dragged behind him',
    move: 'A full-body spin that carries him along with the blade',
    flaw: 'Once he starts swinging he cannot stop or steer',
  },
  {
    body: 'A heron made of wet newspaper, ink still running',
    weapon: 'A beak sharpened on a curb',
    move: 'Unfolds into a headline nobody wants to read',
    flaw: 'Falls apart a little more with every hit taken',
  },
  {
    body: 'A retired chess computer in a scuffed beige case',
    weapon: 'Predicts your movement and is already standing there',
    move: 'Announces mate in four and is usually right',
    flaw: 'Takes forever to make the first move',
  },
  {
    body: 'An enormous moth in a very small business suit',
    weapon: 'Wing dust that gets in the eyes',
    move: 'Flies directly into the arena floodlight, blinding everyone',
    flaw: 'Cannot resist any light source, including the exit sign',
  },
  {
    body: 'A tide pool given legs, crabs still living in it',
    weapon: 'Whatever the crabs are holding today',
    move: 'Recedes entirely, then comes back in all at once',
    flaw: 'Dries out badly under the arena lights',
  },
  {
    body: 'A scarecrow stuffed with old parking tickets',
    weapon: 'A rake missing most of its teeth',
    move: 'Stands perfectly still until you forget it is there',
    flaw: 'Goes up fast if anything gets hot',
  },
  {
    body: 'A church organ on caterpillar treads',
    weapon: 'A low note you feel in your sternum',
    move: 'All stops out, every pipe at once',
    flaw: 'Takes a long wheezing breath before any big sound',
  },
  {
    body: 'A greyhound made of blown glass, hollow and singing',
    weapon: 'Speed, and edges that were never sanded down',
    move: 'One pass so fast it leaves a note hanging in the air',
    flaw: 'A solid hit anywhere is a solid hit everywhere',
  },
  {
    body: 'A landfill seagull the size of a refrigerator',
    weapon: 'A beak that has opened things it should not have',
    move: 'Regurgitates forty years of the dump at close range',
    flaw: 'Abandons the fight instantly if it sees food',
  },
  {
    body: 'A hotel ice machine, permanently frosted over',
    weapon: 'Hail, delivered by the bucket',
    move: 'Freezes the floor of the arena solid',
    flaw: 'Overheats badly the harder it works',
  },
  {
    body: 'A librarian who has not been outside since 1987',
    weapon: 'A date stamp used with real conviction',
    move: 'A silence so total the opponent stops moving',
    flaw: 'Physically incapable of raising her voice or her fists',
  },
]

async function main() {
  if (!URL_BASE || !PUBLISHABLE_KEY) {
    console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before running the seed.')
    process.exit(1)
  }

  let made = 0
  for (const [index, prompts] of SEEDS.entries()) {
    const res = await fetch(`${URL_BASE}/functions/v1/create-fighter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ sessionId: randomUUID(), prompts }),
    })

    const payload = (await res.json().catch(() => null)) as
      | { fighter?: { name: string; title: string }; error?: string }
      | null

    if (!res.ok || !payload?.fighter) {
      console.error(`  ${index + 1}/${SEEDS.length}  failed — ${payload?.error ?? res.status}`)
      continue
    }

    made += 1
    console.log(`  ${index + 1}/${SEEDS.length}  ${payload.fighter.name} — ${payload.fighter.title}`)
  }

  console.log(`\nSeeded ${made} of ${SEEDS.length} fighters.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
