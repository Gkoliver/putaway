# Task 3 Report: Magic-link auth + sessions

## Status

Complete.

## Implementation

- Added cryptographically random UUID v4 IDs and 64-character random tokens.
- Added `Mailer`, recording `NullMailer`, and production `PhpMailMailer`.
- Added `AuthService` for normalized/validated emails, 15-minute magic links, one-time token consumption, user creation, configured session TTLs, bearer lookup, and session revocation.
- Added a five-request-per-email-per-15-minute rate limit.
- Added `AuthController` with all five required API/web routes and the secure `putaway_session` browser cookie.
- Added query-string parsing to `Request`, registered auth routes, and set UTC in bootstrap.

## TDD evidence

The first focused test run failed with five missing-class errors for `Putaway\Auth\NullMailer`. After implementing the service, the focused suite passed with 5 tests and 11 assertions.

The controller test was added next and failed with three missing-class errors for `Putaway\Auth\AuthController`. After implementing the controller and query parsing, it passed with 3 tests and 13 assertions.

Tests use SQLite in-memory with only `users`, `sessions`, and `magic_link_tokens`. `NullMailer` records the last URL without sending mail.

## Verification

- All 11 changed PHP source/test files passed `php -l`.
- PHPUnit passed: 12 tests, 29 assertions, 0 failures.
- IDE diagnostics reported no linter errors.
- `git diff --check` passed.

## Concerns

- `PhpMailMailer` uses PHP's host-configured `mail()` transport; delivery depends on cPanel mail configuration and needs a deployment smoke test.
- Rate limiting uses unexpired 15-minute token rows, sharing limits across PHP workers without adding schema outside this task.
