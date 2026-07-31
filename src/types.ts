// Single source of truth lives with the Edge Functions, since they own
// generation and fight resolution. The client just reads these shapes.
export * from '../supabase/functions/_shared/types.ts'
