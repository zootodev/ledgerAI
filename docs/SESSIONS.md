# LedgerAI — session limits

LedgerAI holds financial records, so it uses short session windows rather than
the long defaults from earlier releases.

## Limits

| Setting | Default | Range | Meaning |
| --- | --- | --- | --- |
| `SESSION_IDLE_MINUTES` | `30` | 5–1440 | Sign out after this long without pointer, key, scroll, touch or tab-visibility activity. |
| `SESSION_MAX_AGE_HOURS` | `12` | 1–336 | Absolute lifetime, measured from the earliest `amr` timestamp in the verified access token. Activity never extends it. |

Invalid or non-positive values fall back to the defaults. Values outside the
range are clamped. The last-seen cookie is HMAC-signed, httpOnly, and refreshed
at most once every five minutes.

## Activity ping

The authenticated layout mounts one idle guard. It calls
`POST /api/session/ping` at most once every five minutes while the user is
active. The Route Handler checks the Supabase session, writes a fresh signed
last-seen cookie when the existing one is at least five minutes old, and returns
a bodyless `204` with `Cache-Control: no-store`. Requests with a `401` have no
valid session. Only same-origin requests are accepted.

The ping is **not** exempt from the proxy's session checks. An already-idle
session is redirected to `/login?reason=session_expired` on the ping rather
than revived by it. The proxy also passes `expiry=idle` or `expiry=absolute` so
the sign-in page can explain which limit was reached.

At 28 minutes of a default 30-minute idle window, an accessible alert dialog
offers **Stay signed in** (pings and resets the timer) and **Sign out** (uses
the normal server sign-out). Escape behaves as **Stay signed in**. A live
countdown reaches zero at the idle limit and redirects to the sign-in page.
Activity in one browser tab resets the others through `BroadcastChannel`, with
a `localStorage` event fallback. No timers run on public pages.

## Deploying after the change

Delete `SESSION_IDLE_HOURS` and `SESSION_MAX_AGE_DAYS` from the Vercel project
(and from any local `.env` files). The app deliberately never reads those old
names: leaving them set cannot restore the previous 72-hour idle or 14-day
absolute limits. Keep `SESSION_COOKIE_SECRET` configured so idle enforcement
and the signed last-seen cookie work.

Use the new names in Vercel instead:

```text
SESSION_IDLE_MINUTES=30
SESSION_MAX_AGE_HOURS=12
```
