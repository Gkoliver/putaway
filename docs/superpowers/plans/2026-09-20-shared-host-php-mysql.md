# Shared-host PHP/MySQL rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Next/Neon/Resend backend with a PHP + MySQL app on put-away.com so Expo and a lean website run on iWebFusion without Vercel/Neon/Resend.

**Architecture:** New `apps/server` PHP front-controller serves JSON under `/api/*` and lean HTML pages for sign-in, inventory, and places. MySQL holds the ported schema. Magic links use host SMTP. OpenAI stays server-side for voice/extract/suggest. Expo keeps UI and switches `EXPO_PUBLIC_API_BASE` + auth to the new bearer/session API.

**Tech Stack:** PHP 8.2+, Composer, PHPUnit, PDO MySQL, OpenAI HTTP API, Expo (existing), Apache/LiteSpeed + `.htaccess` on iWebFusion.

## Global Constraints

- Host: iWebFusion Starter; domain put-away.com already on that cPanel
- Keep Expo mobile; rewrite backend only
- PHP + MySQL only for production server
- Magic link auth via iWebFusion mail (no Resend)
- Keep OpenAI for transcription, extract, suggest
- Lean web v1: sign-in, inventory, places, basic edit — no web Talk UI
- Preserve Expo JSON contracts in `apps/mobile/src/api.ts` where practical
- UUIDs as `CHAR(36)`; prepared statements only; secrets outside `public/`
- Spec: `docs/superpowers/specs/2026-09-20-shared-host-php-mysql-design.md`

## File map

| Path | Responsibility |
| --- | --- |
| `apps/server/composer.json` | PHP deps (phpunit); autoload `Putaway\\` → `src/` |
| `apps/server/public/index.php` | Front controller |
| `apps/server/public/.htaccess` | Route all non-files to `index.php` |
| `apps/server/config/config.example.php` | DB, mail, OpenAI, app URL template |
| `apps/server/sql/001_schema.sql` | Full MySQL schema |
| `apps/server/src/Db.php` | PDO factory |
| `apps/server/src/Router.php` | Method + path dispatch |
| `apps/server/src/Http/Request.php` | Method, path, JSON/form, bearer, cookies |
| `apps/server/src/Http/Response.php` | JSON / HTML / redirects |
| `apps/server/src/Auth/*` | Users, magic links, sessions |
| `apps/server/src/Households/*` | Households, members, invites |
| `apps/server/src/Inventory/*` | Locations, items, lots, edit |
| `apps/server/src/Commands/*` | Interpret + handle + OpenAI + receipts |
| `apps/server/src/Web/*` | Lean page controllers + templates |
| `apps/server/tests/*` | PHPUnit tests |
| `apps/mobile/src/auth.ts` / `api.ts` | Point at new auth + API base |
| `apps/mobile/.env.example` | Document `EXPO_PUBLIC_API_BASE=https://put-away.com` |

---

### Task 1: PHP app skeleton + MySQL schema

**Files:**
- Create: `apps/server/composer.json`
- Create: `apps/server/phpunit.xml`
- Create: `apps/server/public/index.php`
- Create: `apps/server/public/.htaccess`
- Create: `apps/server/config/config.example.php`
- Create: `apps/server/sql/001_schema.sql`
- Create: `apps/server/src/Db.php`
- Create: `apps/server/src/bootstrap.php`
- Create: `apps/server/tests/SmokeTest.php`
- Modify: `.gitignore` (ignore `apps/server/config/config.php`, `apps/server/vendor/`)

**Interfaces:**
- Produces: `Putaway\Db::pdo(): PDO` reading `apps/server/config/config.php`
- Produces: tables listed in schema below

- [ ] **Step 1: Add composer + phpunit smoke test**

`apps/server/composer.json`:
```json
{
  "name": "putaway/server",
  "require": {
    "php": ">=8.2"
  },
  "require-dev": {
    "phpunit/phpunit": "^11.0"
  },
  "autoload": {
    "psr-4": { "Putaway\\": "src/" }
  },
  "autoload-dev": {
    "psr-4": { "Putaway\\Tests\\": "tests/" }
  }
}
```

`apps/server/tests/SmokeTest.php`:
```php
<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;

final class SmokeTest extends TestCase
{
    public function test_phpunit_runs(): void
    {
        $this->assertTrue(true);
    }
}
```

- [ ] **Step 2: Install and run smoke test**

```bash
cd apps/server && composer install && ./vendor/bin/phpunit
```
Expected: PASS `SmokeTest`

- [ ] **Step 3: Write schema SQL**

`apps/server/sql/001_schema.sql` must create:
- `users` (`id` CHAR(36) PK, `email` UNIQUE, `name`, `created_at`)
- `sessions` (`id` CHAR(36) PK, `user_id`, `token` UNIQUE, `expires_at`, `created_at`)
- `magic_link_tokens` (`id` CHAR(36) PK, `email`, `token` UNIQUE, `expires_at`, `consumed_at`)
- `households`, `household_members` (PK household_id+user_id, role ENUM/owner|member)
- `invites`
- `locations` (parent_id NULLABLE, archived_at NULLABLE)
- `items` (UNIQUE household_id + lower(name) via generated/unique key strategy compatible with MySQL)
- `stock_lots` (UNIQUE household_id, item_id, location_id)
- `command_receipts` (UNIQUE household_id, user_id, client_command_id; `result_json` TEXT)

- [ ] **Step 4: Implement Db + config example + front controller stub**

`config.example.php` keys: `db_dsn`, `db_user`, `db_pass`, `app_url` (`https://put-away.com`), `mail_from`, `openai_api_key`, `session_ttl_seconds`.

`public/.htaccess`:
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.php [L]
```

`public/index.php` temporarily returns `{"ok":true}`.

- [ ] **Step 5: Commit**

```bash
git add apps/server .gitignore
git commit -m "chore: scaffold PHP server and MySQL schema"
```

---

### Task 2: Router, Request, Response

**Files:**
- Create: `apps/server/src/Http/Request.php`
- Create: `apps/server/src/Http/Response.php`
- Create: `apps/server/src/Router.php`
- Create: `apps/server/tests/RouterTest.php`
- Modify: `apps/server/public/index.php`

**Interfaces:**
- Produces: `Request::fromGlobals(): Request` with `method`, `path`, `header(string): ?string`, `bearerToken(): ?string`, `json(): array`, `bodyParam(string): ?string`
- Produces: `Response::json(mixed $data, int $status = 200): Response`, `Response::html(string $html, int $status = 200): Response`
- Produces: `Router::add(string $method, string $pattern, callable $handler): void`, `Router::dispatch(Request): Response` — patterns like `/api/households/{householdId}/inventory`

- [ ] **Step 1: Write failing router test**

```php
public function test_matches_path_params(): void
{
    $router = new \Putaway\Router();
    $router->add('GET', '/api/households/{householdId}/inventory', function ($req, $params) {
        return \Putaway\Http\Response::json(['id' => $params['householdId']]);
    });
    $req = \Putaway\Http\Request::fake('GET', '/api/households/abc/inventory');
    $res = $router->dispatch($req);
    $this->assertSame(200, $res->status);
    $this->assertSame(['id' => 'abc'], json_decode($res->body, true));
}
```

Add `Request::fake` for tests.

- [ ] **Step 2: Run test — expect FAIL (class not found)**

```bash
cd apps/server && ./vendor/bin/phpunit tests/RouterTest.php
```

- [ ] **Step 3: Implement Request, Response, Router; wire index.php**

404 JSON `{"error":"not_found"}` when no match.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): add HTTP router request and response"
```

---

### Task 3: Magic-link auth + sessions

**Files:**
- Create: `apps/server/src/Auth/Uuid.php` (`Uuid::v4(): string`)
- Create: `apps/server/src/Auth/Mailer.php` (interface + `SmtpMailer` / `PhpMailMailer`)
- Create: `apps/server/src/Auth/AuthService.php`
- Create: `apps/server/src/Auth/AuthController.php`
- Create: `apps/server/tests/AuthServiceTest.php`
- Modify: `apps/server/public/index.php` (register auth routes)
- Modify: `apps/server/src/bootstrap.php`

**Interfaces:**
- Consumes: `Db::pdo()`, config `app_url`, `mail_from`, `session_ttl_seconds`
- Produces:
  - `AuthService::requestMagicLink(string $email): void` — inserts token, sends mail; throws on mail failure
  - `AuthService::consumeMagicLink(string $token): array{userId: string, sessionToken: string}`
  - `AuthService::userIdForBearer(?string $token): ?string`
  - `AuthService::revokeSession(string $sessionToken): void`
- Routes:
  - `POST /api/auth/magic-link` body `{ "email": "a@b.com" }` → `201` `{"ok":true}` or `502` if mail fails
  - `GET /api/auth/verify?token=...` → `200` `{"token":"<sessionToken>","user":{"id","email"}}` (Expo uses JSON)
  - `GET /auth/verify?token=...` → set cookie `putaway_session` + redirect `/inventory`
  - `POST /api/auth/sign-out` Authorization Bearer → `204`
  - `GET /api/auth/me` → `200` user or `401`

- [ ] **Step 1: Write AuthServiceTest with in-memory/sqlite OR transactional MySQL test DB**

Prefer MySQL test DB from config `TEST_DATABASE_URL` / `config.test.php`. Test: requestMagicLink stores token; consume creates session; bearer resolves user; second consume fails.

Use a `NullMailer` that records the last URL for tests (do not send).

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement AuthService + controllers + NullMailer for tests / PhpMail for prod**

Magic link URL: `{app_url}/auth/verify?token={token}` for browser; Expo may call `/api/auth/verify?token=` after opening app link — support both. Rate-limit: reject more than 5 magic-link requests per email per 15 minutes with `429`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): magic link auth and bearer sessions"
```

---

### Task 4: Households + invites

**Files:**
- Create: `apps/server/src/Households/HouseholdService.php`
- Create: `apps/server/src/Households/HouseholdController.php`
- Create: `apps/server/tests/HouseholdServiceTest.php`
- Modify: router registrations

**Interfaces:**
- Produces shapes matching Expo:
  - `GET /api/households` → `[{householdId, name, role}]`
  - `POST /api/households` `{name}` → `{householdId, role:"owner"}` 201
  - `POST /api/households/invites` `{householdId, email, role}` → `{token, ...}` 201 (owner only)
  - `POST /api/households/invites/accept` `{token}` → `{householdId}` 
- `requireMembership(pdo, userId, householdId): ?{role}`

- [ ] **Step 1: Failing tests for create household + list + invite accept**

- [ ] **Step 2: Implement services/controllers**

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(server): households and invites API"
```

---

### Task 5: Locations tree API

**Files:**
- Create: `apps/server/src/Inventory/LocationService.php`
- Create: `apps/server/src/Inventory/LocationController.php`
- Create: `apps/server/tests/LocationServiceTest.php`

**Interfaces:**
- Match mobile `fetchLocations` / create / patch expectations in `apps/mobile/src/api.ts` (read that file and mirror field names exactly: ids, `parentId`, `name`, path labels as returned today)
- `GET/POST/PATCH /api/households/{householdId}/locations`
- Enforce membership; prevent cycles on reparent; unique sibling names case-insensitive

- [ ] **Step 1: Read `apps/mobile/src/api.ts` location types and write PHPUnit asserting same JSON keys**

- [ ] **Step 2: Implement LocationService (create, rename, move, list tree)**

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(server): locations tree API"
```

---

### Task 6: Inventory list + edit API

**Files:**
- Create: `apps/server/src/Inventory/InventoryService.php`
- Create: `apps/server/src/Inventory/InventoryController.php`
- Create: `apps/server/tests/InventoryServiceTest.php`

**Interfaces:**
- `GET /api/households/{id}/inventory` → `[{itemId, itemName, locationId, pathLabel, quantity}]` (match Expo `InventoryRow`)
- `PATCH` body `{itemId, locationId, name, quantity, locationPath}` → success JSON or `{error, spoken}` with 400/404/409

- [ ] **Step 1: Failing tests for list after manual lot insert + patch rename**

- [ ] **Step 2: Implement list (join lots/items/locations + path label) and editLot port**

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "feat(server): inventory list and edit API"
```

---

### Task 7: Commands pipeline (regex first, then OpenAI)

**Files:**
- Create: `apps/server/src/Commands/Interpreter.php` (port critical patterns from `packages/shared/src/interpreter.ts`)
- Create: `apps/server/src/Commands/CommandHandler.php` (port logic from `apps/web/src/lib/inventory/handler.ts`)
- Create: `apps/server/src/Commands/OpenAiClient.php`
- Create: `apps/server/src/Commands/CommandController.php`
- Create: `apps/server/src/Commands/ReceiptStore.php`
- Create: `apps/server/tests/InterpreterTest.php`
- Create: `apps/server/tests/CommandHandlerTest.php`

**Interfaces:**
- `POST /api/commands` JSON or multipart (`householdId`, `clientCommandId`, optional `transcript`/`command`/`audio`)
- Authorization Bearer required; membership required
- Response body is `CommandOutcome` JSON (`type` ok|clarification|error) — same fields as `@putaway/shared`
- Idempotent via `command_receipts`
- OpenAI failures on audio → `{type:"error", code:"voice_unavailable", spoken:"Voice is unavailable — type it instead."}`
- Unconfirmed `put_away_batch` → clarification `confirm_batch`

- [ ] **Step 1: Port interpreter tests from `packages/shared/src/interpreter.test.ts` for put_away / take_out / find / batch phrases into PHPUnit**

- [ ] **Step 2: Implement Interpreter until those tests pass**

- [ ] **Step 3: Handler tests with DB: put_away increments lot; take_out decrements; receipts replay**

- [ ] **Step 4: Implement CommandHandler + ReceiptStore + Controller**

- [ ] **Step 5: OpenAiClient with injectable HTTP stub; test suggest-on-miss and extract wiring**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(server): commands API with interpreter OpenAI and receipts"
```

---

### Task 8: Lean PHP web UI

**Files:**
- Create: `apps/server/src/Web/layout.php` (HTML layout helper)
- Create: `apps/server/src/Web/SignInController.php`
- Create: `apps/server/src/Web/InventoryPage.php`
- Create: `apps/server/src/Web/PlacesPage.php`
- Create: `apps/server/src/Web/Csrf.php`
- Modify: router for `/`, `/sign-in`, `/inventory`, `/places`, form POSTs

**Interfaces:**
- Cookie session via `putaway_session`
- CSRF token on all mutating forms
- Pages call the same services as API (no duplicated business rules)

- [ ] **Step 1: Sign-in page + magic link form (shows “check your email” on success)**

- [ ] **Step 2: Inventory page (list + search + edit form) gated on session**

- [ ] **Step 3: Places page (tree + create/rename/reparent forms)**

- [ ] **Step 4: Manual smoke script checklist in `apps/server/README.md`**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(server): lean web UI for sign-in inventory and places"
```

---

### Task 9: Point Expo at PHP auth + API

**Files:**
- Modify: `apps/mobile/src/auth.ts`
- Modify: `apps/mobile/src/sessionAuth.ts` (if needed)
- Create/Modify: mobile sign-in screen to call `POST /api/auth/magic-link` and open/verify flow returning bearer token
- Modify: `apps/mobile/.env.example` → `EXPO_PUBLIC_API_BASE=https://put-away.com`
- Modify: `apps/mobile/README.md`

**Interfaces:**
- After verify, store bearer token the same way current Better Auth cookie/token is stored for `authorization: Bearer`
- `fetchHouseholds` / `submitCommand` paths unchanged (`/api/...`)

- [ ] **Step 1: Map current auth entry points; replace Better Auth client calls with fetch to new endpoints**

- [ ] **Step 2: Ensure Talk/List still send `Authorization: Bearer`**

- [ ] **Step 3: Run mobile unit tests that do not need network**

```bash
cd apps/mobile && npm test
```

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(mobile): authenticate against PHP magic-link API"
```

---

### Task 10: Deploy to put-away.com + cutover checklist

**Files:**
- Create: `apps/server/README.md` deploy section (cPanel docroot, config.php, import SQL, mail settings, OpenAI key)
- Modify: mobile EAS/env for production API base

- [ ] **Step 1: Document cPanel steps**

1. Create MySQL DB/user; import `sql/001_schema.sql`
2. Copy `config.example.php` → `config.php` with real values (`db_dsn` = `mysql:host=localhost;dbname=...;charset=utf8mb4`)
3. Point put-away.com docroot to `apps/server/public` (or upload `public/` + sibling `src/`/`config/`/`vendor/` as documented)
4. Ensure SSL; set `app_url` to `https://put-away.com`
5. Configure `mail_from` as a mailbox on the domain
6. Set `openai_api_key`

- [ ] **Step 2: Smoke on production**

- Magic link email arrives and verifies (web + phone)
- Create household; inventory edit; places create/reparent
- Talk: put away, take out, find, batch confirm
- Invite accept

- [ ] **Step 3: Ship mobile build with `EXPO_PUBLIC_API_BASE=https://put-away.com`**

- [ ] **Step 4: Disable/remove Vercel project usage; leave Neon paused/deleted when ready**

- [ ] **Step 5: Commit README + env example updates**

```bash
git commit -m "docs: add put-away.com PHP deploy and cutover checklist"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| PHP + MySQL on put-away.com | 1, 10 |
| Magic link via host mail | 3, 10 |
| Expo kept; API contracts | 4–7, 9 |
| Households/invites/locations/inventory/commands | 4–7 |
| OpenAI voice/extract/suggest | 7 |
| Lean web UI | 8 |
| Security (PDO, CSRF, bearer, rate limit) | 3, 8 |
| Cutover / drop Neon Vercel Resend | 10 |
| No auto Neon migration | 10 (fresh DB) |

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-20-shared-host-php-mysql.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — run tasks in this session with checkpoints  

Which approach?
