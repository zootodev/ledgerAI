# LedgerAI — Database backups

The Supabase **Free plan has no automated backups and no Point-in-Time
Recovery**, so this repository produces its own: a weekly, encrypted logical
dump of the database, uploaded as a GitHub Actions artifact.

`.github/workflows/db-backup.yml` is the whole pipeline. This document covers
setting it up, running it, and restoring from it.

> **This repository is public.** Actions artifacts on a public repository can be
> downloaded by anyone signed in to GitHub, so the dump is encrypted with
> [`age`](https://age-encryption.org/) before it is uploaded. Plaintext dumps
> exist only on the runner, and only until the encryption step deletes them.

If the project is ever upgraded to a paid Supabase plan, keep Supabase's own
backups/PITR **as well** — this workflow is a complement, not a replacement for
point-in-time recovery. See `OPERATIONS.md` §2.

---

## 1. What the workflow does

Runs Sundays at **02:00 UTC** (and on demand via *workflow_dispatch*):

1. Installs the `postgresql-client` **major version that matches the server**
   (currently **17**) from the PostgreSQL APT repository (PGDG). The distro
   package is a different version, and `pg_dump` refuses to dump a server newer
   than itself.
2. Confirms the client matches the live server (`SELECT version()`), failing
   loudly if they have diverged.
3. Dumps the `public` and `auth` schemas in custom format
   (`ledgerai.dump`) — no roles, no ownership, no ACLs.
4. Writes a plaintext schema-only SQL file (`ledgerai-schema.sql`) for
   reference.
5. Sanity-checks the dump **before encrypting**: `pg_restore --list` must
   succeed, the `public` schema must be present, and the file must be larger
   than 10 KB.
6. Encrypts the dump to `ledgerai-YYYY-MM-DD.dump.age` with the configured
   public key, then deletes the plaintext and fails if any plaintext file
   remains.
7. Uploads **only** the `.age` file as the artifact `db-backup-YYYY-MM-DD`,
   retained for **90 days**.

Any error fails the job, which emails the repository owner. There is no
notification integration to maintain.

---

## 2. One-time setup

### a. Generate the encryption key

Do this on a trusted machine, ideally one you already use for secrets:

```bash
# Install age: https://github.com/FiloSottile/age/releases (pin a version
# and verify the checksum), or `apt install age` on recent Debian/Ubuntu.
age-keygen -o ledgerai-backup.key
```

It prints the public key:

```
Public key: age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p
```

The same public key is stored in the file as a `# public key:` comment line, so
you can recover it later with
`grep '^# public key:' ledgerai-backup.key`.

**Handle the two halves differently:**

| | File | Where it lives |
| --- | --- | --- |
| **Private key** | `ledgerai-backup.key` | **Offline** — password manager, encrypted USB, printed copy in a safe. It never goes on a runner or into this repository. |
| **Public key** | the `age1…` line | In the `BACKUP_AGE_RECIPIENT` repository secret. Safe to publish. |

- **Lose the private key and every backup becomes unreadable.** There is no
  recovery — that is the point of public-key encryption.
- **Leak the private key** and anyone can decrypt the artifacts. Generate a new
  key pair, update the secret, and re-run the workflow to produce a backup
  encrypted to the new key.
- `.gitignore` ignores `*.key`, `*.dump`, and `*.age` so these cannot be
  committed by accident.

### b. Add the repository secrets

*Settings → Secrets and variables → Actions → New repository secret*:

| Secret | Value |
| --- | --- |
| `BACKUP_DATABASE_URL` | Supabase **session pooler** connection string, **port 5432** (*Connect → Session pooler*). Append `?sslmode=require` if it is not already there. |
| `BACKUP_AGE_RECIPIENT` | The `age1…` public key from step (a). |

Notes:

- Use the **session** pooler, not the transaction pooler (port 6543) —
  `pg_dump` needs session-level features the transaction pooler rejects.
- The URL is passed to each step through an environment variable and is never
  echoed, so it does not appear in the logs.
- Consider a dedicated role for backups. The default `postgres` role works and
  can read both dumped schemas, but a narrower role limits what a leaked secret
  could do.

### c. First run

*Actions → Database backup → Run workflow*. Then:

1. Check the job summary — it records the artifact name, size, and SHA-256.
2. Download the artifact and complete a **restore drill** (§5) at least once.
   A backup that has never been restored is not a verified backup.

---

## 3. Running it manually

The scheduled run is weekly; you can trigger one whenever you are about to do
something risky (a migration, a bulk import, a schema change).

```bash
# Via the GitHub CLI
gh workflow run db-backup.yml
gh run watch
```

Or *Actions → Database backup → Run workflow* in the browser.

**Local run (optional).** With `pg_dump`/`pg_restore` 17 and `age` on your
`PATH`:

```bash
export BACKUP_DATABASE_URL='postgresql://...session-pooler...?sslmode=require'

pg_dump "$BACKUP_DATABASE_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --file=ledgerai.dump

pg_restore --list ledgerai.dump | head          # sanity check

age -r "$(grep '^# public key: ' ledgerai-backup.key | cut -d' ' -f4)" \
  -o "ledgerai-$(date -u +%F).dump.age" ledgerai.dump

rm -f ledgerai.dump                             # do not leave plaintext around
```

---

## 4. Route to the artifact

```bash
gh run list --workflow=db-backup.yml
gh run download <run-id> -n db-backup-YYYY-MM-DD
```

Or download it from the *Artifacts* section of the run page. Artifacts are
deleted after 90 days; the weekly schedule means there are normally about
thirteen available at any time.

---

## 5. Restore

> ### Read this first
>
> - **Never restore straight over production.** `--clean` drops objects as it
>   goes. Restore into a **new Supabase project** or a Supabase **branch**, verify
>   the data, and only then decide how to move it across.
> - Supabase manages the `auth` schema itself. Restoring it over an existing
>   project will produce permission errors on objects the platform owns — that is
>   expected. See the notes below.
> - Work from a copy of the plaintext dump so you can retry, and delete it when
>   you are finished.

### Restore steps

```bash
# 0. Download the artifact (see §4) and confirm the SHA-256 against the value in
#    the workflow run summary.

# 1. Decrypt. Needs the offline private key.
age -d -i ledgerai-backup.key -o ledgerai.dump ledgerai-YYYY-MM-DD.dump.age

# 2. Inspect before you touch a database: list the archive contents, and read
#    the plaintext schema reference if you kept it.
pg_restore --list ledgerai.dump | less

# 3. Restore into the target (NEW project or branch — never production).
pg_restore --no-owner --clean --if-exists -d "$TARGET_DATABASE_URL" ledgerai.dump

# 4. Delete the plaintext when done.
rm -f ledgerai.dump
```

`--clean --if-exists` makes the restore repeatable; `--no-owner` avoids
referring to roles that do not exist in the target project. Add
`--exit-on-error` if you would rather stop at the first problem, or `--verbose`
to see exactly what is happening.

### Restoring the application data (`public`)

The `public` schema is the application: tables, constraints, indexes, **RLS
policies**, functions, and triggers. This is the restore that matters for
LedgerAI data, and it applies cleanly to a fresh project that already has the
required extensions available:

```bash
pg_restore --no-owner --clean --if-exists --schema=public \
  -d "$TARGET_DATABASE_URL" ledgerai.dump
```

Afterwards, confirm RLS is active on the expected tables (see
`SUPABASE_RLS.md`) — the policies come back with the dump, but "RLS enabled" is
a table property that a restore applies as ordinary DDL, so it is worth a quick
check.

### Restoring auth (`auth`)

`auth.users` and `auth.identities` are in the dump, but on a fresh Supabase
project the `auth` schema is owned and managed by the platform. Expect errors
like `must be owner of table users` for objects the platform controls.

Practical options:

- **Users only** (usually what you want):
  ```bash
  pg_restore --no-owner --data-only --table=auth.users \
    -d "$TARGET_DATABASE_URL" ledgerai.dump
  ```
  Users will need to reset their passwords, or you can invite them again.
- **Leave auth to Supabase** and let people sign up / reset as normal.

Do not try to recreate Supabase's own `auth` objects by hand.

### What is *not* in the dump

- **Database roles and logins.** `pg_dump` never dumps cluster-level roles
  (that is `pg_dumpall`), and `--no-owner --no-privileges` strips ownership and
  ACL statements.
- **Supabase Storage objects** (uploaded receipt images and similar files).
  These live in object storage, not in Postgres.
- **Project configuration** — auth providers, SMTP, redirect URLs, API keys,
  database passwords. These are platform settings, not database contents.
- **Schemas other than `public` and `auth`** (including extension schemas such
  as `cron`/`extensions`, and Supabase's internal `storage`/`realtime` tables).

A restored project therefore needs its platform settings re-applied — the
checklist in `HANDOFF.md` and the environment variables in `.env.example` cover
the application's own configuration.

### Verify the restore

1. `select count(*)` on the main tables and compare against what you expect.
2. Sign in, open `/overview`, and confirm the numbers match.
3. Open a report and an account, and spot-check a few transactions.
4. Confirm a second user cannot see the first user's data (RLS).

---

## 6. Operating notes

- **Retention:** 90 days per artifact. If you need longer, download the
  `.age` files somewhere durable (they are encrypted, so they are safe to
  store) — but keep the key separate from them.
- **Scheduled workflows can be disabled.** GitHub disables scheduled workflows
  in a repository after **60 days without activity**. If the project goes
  quiet, either run the workflow manually now and then or add a trivial commit.
- **Client/server version drift.** The workflow pins `PG_CLIENT_MAJOR: "17"` and
  fails with a clear message if the server no longer matches. When Supabase
  upgrades Postgres, bump that value (and the package name) in the workflow.
- **Rotating the age key.** Generate a new pair, replace the
  `BACKUP_AGE_RECIPIENT` secret, re-run the workflow, and keep the old private
  key for as long as you need to read older artifacts.
- **Cost.** Actions is free for public repositories; artifacts count against
  the account's Actions storage allowance.

## 7. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `pg_dump: error: server version: 18.x; pg_dump version: 17.x` | Server was upgraded | Bump `PG_CLIENT_MAJOR` in the workflow |
| `The BACKUP_DATABASE_URL secret is not set` | Secret missing/renamed | Add it per §2b |
| `The BACKUP_AGE_RECIPIENT secret is not set` | Secret missing/renamed | Add the `age1…` public key |
| `checksum did not match` | Corrupted or substituted age download | Re-run; if it persists, check the pinned values against the age release page |
| `permission denied for table …` while dumping `auth` | Role cannot read the auth schema | Use a role that can, or drop `--schema=auth` (accepting that auth data is then not backed up) |
| Artifact missing after a green run | Name/filename mismatch | Check the job summary; the summary and artifact are named from one timestamp |
| Decryption fails with `no identity matched any of the recipients` | Wrong private key | Use the key whose public half is in `BACKUP_AGE_RECIPIENT` |
