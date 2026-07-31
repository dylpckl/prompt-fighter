import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client. Every write goes through here, which is why RLS on
 * `fighters` has no policies at all — nothing outside these route handlers is
 * allowed to touch the table.
 *
 * Built lazily so a missing env var surfaces as a request-time error rather
 * than breaking the build.
 */
export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  }

  return createClient(url, key, { auth: { persistSession: false } })
}
