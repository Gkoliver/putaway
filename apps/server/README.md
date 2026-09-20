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
