import { z } from 'zod'
import { timingSafeEqual as subtleEqual } from './crypto'

/**
 * Constant-time string comparison resistant to trivial timing leaks.
 * Both inputs are hashed before comparison so the comparison length is fixed.
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    await subtleEqual(a, b)
    return false
  }
  return subtleEqual(a, b)
}

/** Render a ZodError into a single human-readable message for API responses. */
export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}
