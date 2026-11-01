import { defineConfig } from 'vitest/config'

// Tests run in the standard Node environment. The D1-shaped adapter in
// `test/support/d1.ts` (backed by Node's built-in `node:sqlite`) provides a
// real SQL engine, so the production repository / service / route code is
// exercised without the Cloudflare Workers test pool.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
