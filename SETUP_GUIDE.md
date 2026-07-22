# TARSONS HSE Portal — Supabase Migration Setup Guide

This replaces the Google Sheets + Apps Script backend with Supabase
(Postgres database + Storage + Edge Functions), and replaces email
(previously Google's `MailApp`) with Resend.

What you get out of this that Sheets couldn't give you:
- **Real database** instead of a spreadsheet — much faster, no 50k-character
  cell limit, no "sheet got corrupted" risk.
- **Live sync** — changes appear on other users' screens in ~1 second via
  Supabase Realtime, instead of the old 15-second poll.
- **Proper file storage** — photos/PDFs go to Supabase Storage instead of a
  shared Google Drive folder.

---

## Part 1 — Create your Supabase project

1. Go to **https://supabase.com** → **Start your project** → sign up (GitHub
   or email is fine, free tier is enough for this app).
2. Click **New project**.
   - **Name**: `tarsons-hse-portal` (or anything).
   - **Database password**: generate one and **save it somewhere** — you
     won't need it for this app directly, but you'll want it if you ever
     connect a SQL client.
   - **Region**: pick the one closest to your factories (e.g. Mumbai/Singapore).
3. Wait ~2 minutes for it to finish provisioning.
4. Once it's ready, go to **Project Settings → API**. You'll need two values
   from this page later:
   - **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - **anon / public key** (a long string starting with `eyJ...`)

Keep this tab open — you'll copy these into `index.html` in Part 4.

---

## Part 2 — Set up the database, security rules, and file storage

1. In the Supabase dashboard, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this delivery, paste its entire contents
   in, and click **Run**.
3. This creates:
   - the `hse_data` table (one row per app data key — same idea as one sheet
     tab per key before, just a proper table now)
   - Row Level Security policies that allow the app to read/write (see the
     security note below)
   - a Realtime subscription on that table
   - a public Storage bucket called `hse-uploads` for photos/PDFs

4. Confirm it worked: **Table Editor** (sidebar) should now show `hse_data`,
   and **Storage** (sidebar) should show the `hse-uploads` bucket.

### ⚠️ Security note (please read)
The portal doesn't have real server-side login — usernames/passwords are
just rows in the database, checked in the browser. That means the RLS
policies in `schema.sql` allow anyone with the page's embedded `anon` key
to read and write all data. **This is exactly how your old Apps Script setup
worked too** ("Execute as: Me, Access: Anyone") — nothing has gotten less
secure, but nothing has gotten more secure either. If this portal will hold
sensitive data long-term, the real fix is adding Supabase Auth and rewriting
the policies to check `auth.uid()`. Happy to help with that as a follow-up
if you want it.

---

## Part 3 — Email via Resend + a Supabase Edge Function

Supabase (like most databases) can't send email on its own, so this uses
[Resend](https://resend.com) — a transactional email API with a generous
free tier (3,000 emails/month) — called from a small serverless function.

### 3a. Get a Resend API key
1. Go to **https://resend.com** → sign up.
2. **API Keys** → **Create API Key** → copy it (starts with `re_...`).
3. For the "from" address: Resend gives you a working sender out of the box
   (`onboarding@resend.dev`) for testing. For production, add your own
   domain under **Domains** and verify it (a few DNS records) so emails come
   from `hse@tarsons.in` instead.

### 3b. Install the Supabase CLI and deploy the function
On your computer (needs Node.js installed):

```bash
npm install -g supabase
supabase login

# From inside this project's folder (where the supabase/ directory is):
supabase link --project-ref YOUR-PROJECT-REF   # the ref is in your Project URL, e.g. abcdefgh

# Set your secrets (replace with your real values):
supabase secrets set RESEND_API_KEY=re_your_key_here
supabase secrets set FROM_EMAIL="TARSONS HSE Portal <onboarding@resend.dev>"
supabase secrets set ALERT_EMAIL=sayan.saha@tarsons.in

# Deploy:
supabase functions deploy send-email
```

That's it — the function is live at
`https://YOUR-PROJECT-REF.supabase.co/functions/v1/send-email`.

### 3c. About the visitor pass PDF
The old Apps Script version generated a real PDF attachment (via Google
Docs). A Deno Edge Function has no equivalent to that API, so the migrated
version sends the visitor pass as a nicely formatted table **inside the
email itself** instead of a PDF attachment. If you specifically need a real
PDF attachment, the clean way to add it later is a small headless-Chrome
rendering step (e.g. Browserless.io, or a self-hosted Puppeteer function)
that turns the same HTML into a PDF and passes it to Resend's `attachments`
field — let me know if you'd like that built.

### 3d. Daily overdue-alert email (replaces the old time-driven trigger)
1. Open `supabase/cron.sql`, replace `YOUR-PROJECT-REF` and
   `YOUR_SUPABASE_ANON_KEY` with your real values (same ones from Part 1).
2. Run it in the SQL Editor. This schedules a daily check (default 8:00 AM
   UTC — edit the cron expression in the file for your timezone) that emails
   `ALERT_EMAIL` only if something is actually due or overdue, exactly like
   the old `sendOverdueAlertEmail`.

---

## Part 4 — Point the app at your Supabase project

Open `index.html`, find this near the top of the `<script type="module">`
block:

```js
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_KEY";
```

Replace both with the **Project URL** and **anon public key** from Part 1.
Save the file.

---

## Part 5 — Test it

1. Open `index.html` in a browser (or host it — see note below).
2. Top-right should show a green **● Synced** badge — that confirms it can
   reach your `hse_data` table.
3. Log in as `admin` / `admin123`, add a test record anywhere (e.g. a
   Notice), and check **Table Editor → hse_data** in Supabase — you should
   see a `notices` row with your data in it.
4. Open the page in a second browser/tab, make a change in the first — it
   should appear in the second within a second or two (Realtime).
5. Try a photo upload (Gallery) — check **Storage → hse-uploads** in
   Supabase for the file.
6. Try the "Mail" button on a complaint, or "Mail Pass" on a visitor — you
   should get an email via Resend.

### Hosting note
Opening `index.html` directly as a local file works for testing, but the
service worker (offline support) and some browser security policies need it
served over `http(s)`. Any static host works — Netlify, Vercel, GitHub
Pages, Supabase's own Storage as a public bucket, or your existing web
server. Nothing about the file changed in a way that affects hosting.

---

## What changed, file by file

| Old | New |
|---|---|
| Google Sheet (one tab per key) | `hse_data` table in Postgres, one row per key |
| Apps Script `doGet`/`doPost` | Supabase client calls directly from the browser (`supabase.from('hse_data')...`) |
| 15-second polling | Supabase Realtime (instant) + a 60s safety-net poll |
| Google Drive file uploads | Supabase Storage bucket `hse-uploads` |
| `MailApp.sendEmail` (Code.gs) | Resend API, called from the `send-email` Edge Function |
| Time-driven trigger → `sendOverdueAlertEmail` | `pg_cron` job → same Edge Function (`overdueAlertCheck` action) |

`Code (3).gs` is no longer used by the app — you can leave the Apps Script
project in place as a backup/reference, or delete the deployment once you've
confirmed the new setup is working.

The unrelated Firebase Analytics block near the top of `index.html` (`tpl-safety-db`
project) wasn't part of the data backend — it was only pulling in Google
Analytics — so it's left untouched.
