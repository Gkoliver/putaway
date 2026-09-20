# Putaway mobile

## Env
- Copy `.env.example` to `.env` before starting the app.
- `EXPO_PUBLIC_API_BASE` — PHP API origin (defaults to `https://put-away.com`).

## Sign in
1. Enter your email on the Household tab and request a magic link.
2. Copy the complete link from the email into the app.
3. Tap **Verify sign-in link**. The app exchanges the one-time link token at
   `/api/auth/verify` and stores the returned bearer token in SecureStore.

Authenticated household, inventory, location, and command requests send that token as
`Authorization: Bearer …`. Signing out revokes it with `POST /api/auth/sign-out` and clears
local session and household state.

## v1 usable gate
On one iPhone (TestFlight) and one Android (Play internal), same household:

1. Put-away: "I'm putting paper towels on shelf A on the metal shelves in the basement"
2. Find: "where are the paper towels" — confirmation includes item, path, quantity
3. Take-out with two locations — app asks which place
4. Take-out remaining stock — lot stays at 0
5. "where do we normally store paper towels" still names the usual place
6. Web: merge a duplicate location; app find still works
