# Quests are declarative TypeScript files

Each Story is a folder, and each Quest in it is a `.ts` file that exports a tree built from helper functions (`quest()`, `choice()`, `roll()`, `upTo()`/`between()`/`atLeast()`, Effects such as `lose()`, combat blocks), not a data file. Quests branch deeply: Choices, rolls nested inside Outcomes, success counters and Notes checked days later. YAML expressed that shape but was too hard for a human author to write, and a Markdown dialect couldn't express all of it. TypeScript gives authors autocomplete and type errors for unknown stats, items and Abilities while they write.

## Considered Options

- **YAML per Quest**: nests cleanly and is easy to validate, but the indentation and quoting were judged a syntax nightmare for hundreds of hand-written Quests.
- **Markdown dialect**: reads like the printed calendar pages, but couldn't cover nested rolls, success counters, combat and exploration without growing into a fragile custom parser.
- **Imperative scripts** (`async play(q)` with if/else): the most flexible, but the bot can't see a Quest's shape without running it. That breaks startup validation of every path and listing the Abilities that apply, and mid-Quest resume would have to replay recorded rolls.

## Consequences

- Because Quests are declarative, the bot can load every Story at startup and reject invalid Quests before any player meets them, and it can resume a Quest at any Action.
- Any mechanic the helpers can't express needs a new helper (code) before an author can use it. Authors can't improvise logic inside a Quest file.
- Quest files are code that runs inside the bot, so only trusted authors may add Stories.
