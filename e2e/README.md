# E2E safety

**Mutating specs are skipped by default.** A spec that accepts, saves, deletes or imports data (`review-bulk.spec.ts` today) only runs when **both** `E2E_ALLOW_MUTATION=1` and `BASE_URL` resolves to `localhost` / `127.0.0.1`, or to a hostname explicitly listed in `E2E_SAFE_HOSTS` (comma-separated). Never add your production host to that list. Read-only specs (date picker, overview ranges) may still run against any `BASE_URL`.

Always run the review-flow test against a local app backed by a seeded **test tenant**, never a live tenant. The guard is implemented in `mutation-guard.ts`; extend it to any future spec that writes.
