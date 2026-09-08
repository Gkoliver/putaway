# Putaway mobile

## Env
- `EXPO_PUBLIC_API_BASE` — Next.js origin
- Sign in with magic link. Create or join a household.

## v1 usable gate
On one iPhone (TestFlight) and one Android (Play internal), same household:

1. Put-away: "I'm putting paper towels on shelf A on the metal shelves in the basement"
2. Find: "where are the paper towels" — confirmation includes item, path, quantity
3. Take-out with two locations — app asks which place
4. Take-out remaining stock — lot stays at 0
5. "where do we normally store paper towels" still names the usual place
6. Web: merge a duplicate location; app find still works
