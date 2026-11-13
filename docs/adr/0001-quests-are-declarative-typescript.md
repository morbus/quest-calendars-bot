# Quests are declarative TypeScript files

Each Story is a directory, and each Quest in it is a `.ts` file that exports a tree built from helper functions (`quest()`, `choice()`, `roll()`, `upTo()`/`between()`/`atLeast()`, Effects such as `lose()`, combat blocks), not a data file. Quests branch deeply: Choices, rolls nested inside Outcomes, success counters, and Notes that later Quests check. TypeScript gives authors autocomplete and type errors for unknown stats, items, and Abilities.

## Considered options

- **YAML per Quest**: nests cleanly and is easy to validate, but indentation and quoting were judged a syntax nightmare for hundreds of hand-written Quests.
- **Markdown dialect**: reads like a printed page, but couldn't cover nested rolls, success counters, combat, and exploration without a fragile custom parser.
- **Imperative scripts** (`async play(q)` with `if`/`else`): the most flexible, but the bot can't see a Quest's shape without running it. That breaks startup validation of every path and listing the Abilities that apply, and mid-Quest resume would have to replay recorded rolls.

## Consequences

- Because Quests are declarative, the bot can load every Story at startup and reject invalid Quests, and it can resume a Quest at any Action.
- Any mechanic the helpers can't express needs a new helper (code) before an author can use it. Authors can't improvise logic inside a Quest file.
- Quest files are code that runs inside the bot, so only trusted authors may add Stories.
