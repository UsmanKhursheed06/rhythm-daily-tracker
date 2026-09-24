# Rhythm — daily tracker

A mobile-first installable PWA with color-coded weekly time blocks, daily tasks, habits, focus sessions, reflections, completion tracking, and midnight push reminders.

## Architecture

- Next.js static frontend, deployed to Vercel.
- Supabase Auth with Google OAuth; no database password is shipped to the browser.
- Supabase Edge Function `rhythm-api` validates the user on every request.
- AES-256-GCM encrypts tracker record contents and push subscription details before database writes. Random nonces and user/record-bound additional authenticated data protect against modification and record swapping.
- Encryption and Web Push keys are stored in Supabase Vault and accessible only to the service role. This is server-managed encryption, not end-to-end encryption. The trusted backend can decrypt records. Auth identities, record IDs, versions, time zones, and day-completion scheduling metadata are not application-encrypted.
- Postgres RLS limits authenticated users to their own records. The public publishable key is intentionally safe to commit.
- Local browser cache and a durable outbox support offline edits. Device storage contains readable data; sign out clears that user's cache after syncing.
- The scheduler runs every minute and checks local midnight. It skips yesterday if the Day complete flag is true. It leases each device/day notification, retries transient failures up to three times within the midnight hour, and removes expired subscriptions. Push delivery is best-effort and depends on network, OS, and browser policies.

## Development

Use Node 22 or later:

```
npm ci
npm run dev
npm run build
npm run start
npm run typecheck
node scripts/test-encryption.mjs
```

The static production output is `out/`. `npm run start` previews it on port 5173.

## Supabase

Project: `sddeyqpvnmcqjvxqgvmp`. The reference schema is in `supabase/schema/schema.sql`; native Supabase migration history is authoritative. Do not rerun the initial schema over existing tables. Source for the deployed function is in `supabase/functions/rhythm-api/`.

Enable Google under Authentication → Sign In / Providers. Create a Web OAuth client in Google Cloud with this callback:

```
https://sddeyqpvnmcqjvxqgvmp.supabase.co/auth/v1/callback
```

Set the production app URL as Supabase Auth Site URL and add the exact production and local development URLs to its redirect allowlist. Add the app origin to Google's authorized JavaScript origins. Store the Google client secret only in Supabase.

The function has gateway JWT verification disabled because it authenticates users itself through `auth.getUser`, and separately validates the private cron secret for scheduler calls. It rejects missing/invalid user sessions. Never remove those checks.

Back up the Vault-managed encryption key securely before database migrations or project transfers. Losing it makes existing ciphertext unreadable. Never rotate it without a versioned re-encryption migration.

## Notifications

Enable reminders on each device in Settings. iOS requires installation to the Home Screen and a supported OS/browser. Use Day complete after filling in the day; saving a task alone does not close the day. Offline completions must sync before midnight to suppress server reminders. The cron job is named `rhythm-midnight-check`.

## Earlier private prototype

The `.openai/` and Vinext build files preserve the history of the initial owner-private Sites prototype. The current scripts and `vercel.json` target the public Supabase-backed app. Do not publish the former unauthenticated/D1 API for the public version.
