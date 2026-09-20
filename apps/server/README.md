# Putaway PHP server

The server exposes the Expo JSON API under `/api` and the lean browser UI at `/`.

## Local setup

1. Run `composer install`.
2. Copy `config/config.example.php` to `config/config.php` and fill in MySQL, mail, and app settings.
3. Apply `sql/001_schema.sql` to the configured database.
4. Point the web root at `apps/server/public`.
5. Run tests with `./vendor/bin/phpunit`.

The web session cookie is `putaway_session`. Browser form posts also require the
`putaway_csrf` cookie and matching `_csrf` form value.

## Deploy to put-away.com (cPanel)

These steps assume iWebFusion Starter on the existing put-away.com account. Do not commit
`config/config.php` or upload credentials to the repo.

### 1. MySQL database

1. In cPanel → **MySQL® Databases**, create a database (e.g. `cpaneluser_putaway`) and a user
   with a strong password. Add the user to the database with **ALL PRIVILEGES**.
2. Open **phpMyAdmin**, select the new database, **Import** tab → choose `sql/001_schema.sql`
   → **Go**.
3. Confirm all tables appear (`users`, `sessions`, `magic_link_tokens`, `households`, etc.) and
   that the import reports no errors.

**Validate schema on MySQL 8:** cPanel hosts typically run MySQL 8. Before cutover, import
`001_schema.sql` into a throwaway database in phpMyAdmin and confirm a clean run (no syntax or
charset errors). The script uses `utf8mb4`, `InnoDB`, and standard MySQL 8 DDL; if import fails,
fix the SQL locally and re-test before touching production.

### 2. Application files

Upload the `apps/server` tree (or deploy from git on the host if available):

```
apps/server/
  config/config.php      ← created on server only (see below)
  public/                ← web docroot
  sql/
  src/
  vendor/                ← from `composer install --no-dev` on the server or locally
```

On the server:

```bash
cd apps/server
composer install --no-dev --optimize-autoloader
cp config/config.example.php config/config.php
# edit config/config.php with production values
```

### 3. `config/config.php`

Copy `config/config.example.php` → `config/config.php` and set:

| Key | Production value |
| --- | --- |
| `db_dsn` | `mysql:host=localhost;dbname=YOUR_CPANEL_DB_NAME;charset=utf8mb4` |
| `db_user` | cPanel MySQL username (often `cpaneluser_putaway`) |
| `db_pass` | MySQL user password |
| `app_url` | `https://put-away.com` (must match the live HTTPS origin) |
| `mail_from` | A real mailbox on the domain, e.g. `noreply@put-away.com` |
| `openai_api_key` | OpenAI API key (server-side only; never expose to the client) |

Use `localhost` as the MySQL host — shared hosting connects to the local MySQL socket, not a
remote host.

### 4. Document root

Point put-away.com’s docroot at `apps/server/public` (not the repo root).

- **Preferred:** cPanel → **Domains** → put-away.com → set document root to the `public` folder
  inside the deployed server tree.
- **Alternative:** Upload only `public/` contents to `public_html/` and place `src/`, `config/`,
  and `vendor/` as sibling directories above or beside `public_html`, matching the layout in this
  repo (the front controller in `public/index.php` expects that structure).

Ensure `public/index.php` is the only entry point and that `.htaccess` (if present) routes
requests through it.

### 5. SSL

In cPanel → **SSL/TLS Status** (or **Let’s Encrypt**), issue or auto-renew a certificate for
put-away.com. After HTTPS is active, confirm `app_url` is `https://put-away.com`. Session cookies
are marked `Secure`; sign-in will not persist over plain HTTP.

### 6. Mail (`mail_from`)

Create the `mail_from` address as a cPanel mailbox (or forwarder that can send). Magic-link
emails are sent with PHP `mail()` from that address. Send a test sign-in from `/sign-in` and
confirm delivery (check spam if needed).

### 7. OpenAI

Set `openai_api_key` in `config.php`. Talk/voice, extract, and suggest routes call OpenAI from
the server. No client-side key is required.

### 8. Expo production API base

Store builds must target the live PHP API:

```bash
# apps/mobile/.env or EAS build env
EXPO_PUBLIC_API_BASE=https://put-away.com
```

Production API base comes from the `preview` profile in `apps/mobile/eas.json` (store/internal
builds) and/or the fallback in `apps/mobile/src/auth.ts` (`https://put-away.com`). Local dev can
override via `apps/mobile/.env`; there is no separate EAS `production` profile yet. Ensure dev
overrides do not ship to TestFlight or Play internal.

Rebuild and submit the mobile app after the server is live.

### Magic links: web vs Expo

Emails link to `https://put-away.com/auth/verify?token=…`, which opens in a browser, consumes
the one-time token, and sets the `putaway_session` cookie for the lean web UI.

For **Expo**, paste the **complete** link from the email into the app’s sign-in screen and tap
**Verify sign-in link**. The app calls `GET /api/auth/verify` and stores the bearer token. Do
**not** open the email link in Safari/Chrome first if you intend to sign in on the phone — the
token is single-use. Opening it once in a browser consumes it; only then would pasting into
the app fail.

## Production cutover smoke checklist

Run after deploy, with SSL and `config.php` in place:

- [ ] **Magic link (web):** Request sign-in at `/sign-in`; email arrives; link opens
  `/auth/verify` and redirects to `/inventory` with a session cookie.
- [ ] **Magic link (Expo):** Request sign-in in the app; paste the full email link; verify
  succeeds and household data loads.
- [ ] **Household:** Create or select a household; switch picker when multiple exist.
- [ ] **Inventory:** Add or edit an item (name, quantity, place path); reload and confirm.
- [ ] **Places:** Create a top-level and nested place; rename and reparent (as owner).
- [ ] **Talk:** Put away, take out, find, and batch confirm via voice/command flow.
- [ ] **Invite:** Send a household invite and accept it (web or mobile).
- [ ] **Mobile build:** Confirm the shipped app uses `EXPO_PUBLIC_API_BASE=https://put-away.com`.

When the above passes, disable or remove the old Vercel project, pause/delete Neon, and
cancel or remove the Resend account/API usage — there is no automatic migration; production
starts from a fresh MySQL import with host mail for magic links.

## Web UI smoke checklist

- [ ] Open `/`; while signed out it redirects to `/sign-in`.
- [ ] Submit an invalid email and confirm the page shows a validation message.
- [ ] Submit a valid email and confirm “Check your email” appears only after mail succeeds.
- [ ] Open the magic link and confirm it sets the secure `putaway_session` cookie and redirects to `/inventory`.
- [ ] Confirm `/inventory` and `/places` redirect to `/sign-in` without a valid session cookie.
- [ ] With multiple households, switch the household picker and confirm data changes.
- [ ] Search inventory by item name and place path.
- [ ] Edit an item name, quantity, and place path; reload and confirm the change.
- [ ] As an owner, create a top-level and nested place, rename one, and reparent one.
- [ ] As a non-owner member, confirm place mutation forms are absent.
- [ ] Remove or alter `_csrf` in an inventory/place POST and confirm HTTP 403 with no data change.
- [ ] Confirm item/place names containing `<`, `>`, `&`, or quotes render as text, not HTML.
