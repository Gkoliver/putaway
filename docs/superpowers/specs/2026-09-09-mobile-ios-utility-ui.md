# Mobile iOS-utility UI

Skin the Expo Talk, List, and Household tabs to look like a quiet iOS utility app. Same tabs, same behavior, same accessibility labels and copy.

## Visual system

Shared `apps/mobile/src/theme.ts`:

| Token | Value |
| --- | --- |
| Page background | `#F2F2F7` |
| Cards / inputs | `#FFFFFF` |
| Separators | `#C6C6C8` |
| Secondary label | `#8E8E93` |
| Text | `#000000` |
| Destructive | `#FF3B30` |
| Tint / primary actions | `#007AFF` |
| On-tint | `#FFFFFF` |
| Page padding | 16 |
| Card radius | 10 |
| Min tap height | 44 (hold-to-talk 50) |
| Title | 22 semibold |
| Body | 17 |
| Caption | 13 |

Light mode only. No dark mode in this pass.

## Tabs

Keep Talk / List / Household. Light header on the page background, no header shadow, tinted selected tab, SF-style icons (mic, list, house).

## Talk

- Screen uses the page background and 16pt padding.
- Hold-to-talk is a full-width filled tint button. Label: “Hold to talk” / “Listening…”. Keep `accessibilityLabel="Hold to talk"`.
- Confirmation is a white card (`accessibilityLabel="confirmation"`) with the spoken line as body text.
- Errors and “Working…” are caption-sized; errors use destructive red.
- Type + Send sit in a grouped card: input (`accessibilityLabel="transcript"`) then a filled Send button.
- Sign-in / household prompts stay the same copy, styled as body text.

## List

- Refresh is a tinted text control (header or trailing toolbar).
- Rows are inset grouped cells: item name (body), location (caption), quantity trailing.
- Empty: “No items yet.” Errors stay red captions.
- Do not change fetch behavior.

## Household

- Sign-in and signed-in share the same screen chrome.
- Grouped fields, filled primary buttons, tinted text for Sign out / secondary actions.
- Active household shows a checkmark; keep the name readable. Optional “(active)” may remain for clarity.
- Do not change magic-link or create-household behavior.

## Clarification

Location/item candidates use the same grouped rows. Candidate labels stay `pathLabel (quantity)` and item `name` so existing tests keep passing.

## Out of scope

Web UI, dark mode, new screens, API/copy changes, renaming stored inventory, animations, haptics, blur.
