# In-app inventory edit

Tap a List row to change that lot’s **name**, **quantity**, and **location** in one Save.

## Client

- Hidden route (not a tab): Cancel / Save header, iOS-utility form.
- Fields: name, quantity (number pad), location path (`Basement → Cabinet`).
- Split location on ` → `. Empty name, empty location, or non-integer / negative quantity → inline error, no request.
- Success: pop back; List reloads on focus.

## API

`PATCH /api/households/:householdId/inventory`

Auth and membership same as GET. Body: `{ itemId, locationId, name, quantity, locationPath }`.

One transaction in `editLot`:

1. Rename catalog item if the name changed (title-case). Duplicate name → error, no merge.
2. Resolve `locationPath` with create (same as put-away).
3. Same place → set this lot’s quantity (including 0). New place → add this quantity to the destination lot (create if needed), set the source lot to 0.
4. Empty lots are kept.

## Errors

| Case | Message |
| --- | --- |
| Duplicate name | `You already have an item called {name}.` |
| Missing lot / item | `I don't have that item yet.` |
| Bad input | Short inline / `Could not save.` |
| Network | `Could not save.` |

## Out of scope

Delete, name merge, web editor, dark mode.
