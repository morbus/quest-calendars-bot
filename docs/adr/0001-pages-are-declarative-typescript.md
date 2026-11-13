# Pages are declarative TypeScript files

Each Quest is a directory, and each Page in it is a `.ts` file that exports a tree built from helper functions (`page()`, `choice()`, `roll()`, `upTo()`/`between()`/`atLeast()`, Effects such as `lose()`, combat blocks), not a data file. Pages branch deeply: Choices, rolls nested inside Outcomes, success counters, and Notes that later Pages check. TypeScript gives authors autocomplete and type errors for unknown stats, items, and Abilities.

## Considered options

- **YAML per Page**: nests cleanly and is easy to validate, but indentation and quoting were judged a syntax nightmare for hundreds of hand-written Pages.
- **Markdown dialect**: reads like a printed page, but couldn't cover nested rolls, success counters, combat, and exploration without a fragile custom parser.
- **Imperative scripts** (`async play(p)` with `if`/`else`): the most flexible, but the bot can't see a Page's shape without running it. That breaks startup validation of every path and listing the Abilities that apply, and mid-Page resume would have to replay recorded rolls.

## Consequences

- Because Pages are declarative, the bot can load every Quest at startup and reject invalid Pages, and it can resume a Page at any Action.
- Any mechanic the helpers can't express needs a new helper (code) before an author can use it. Authors can't improvise logic inside a Page file.
- Page files are code that runs inside the bot, so only trusted authors may add Quests.
