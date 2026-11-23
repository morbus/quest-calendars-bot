# Coding standards

Read during review. Prettier owns formatting (`npm run format`), and `GLOSSARY.md` owns the domain vocabulary; neither is restated here.

## Order

- **Functions in a module are in alphabetical order**, exported or not. So are the fields of a type and the keys of an object literal.
- **Stats, Traits, and Abilities are always listed in that order** wherever two or more appear together: prose, Player-facing text, test names, SQL columns. A type's fields and an object's keys stay alphabetical, because the rule above governs them. `GLOSSARY.md` entries stay A–Z, and `docs/rules.md` is the publisher's text, so leave its wording alone.

## Comments

- **Every top-level function, type, and constant has a `/** */` doc comment**, and so does each field of an exported type. A helper declared inside a function needs none; give it a name that explains it instead.

## SQL

- **Every SQL string is a `/* sql */` template literal**, including one-word statements such as `` /* sql */ `COMMIT` ``. Prettier formats only those, and it skips a single-quoted string without a warning.
- **Never edit a migration once it has shipped to `main`.** Add a new one at the end of `MIGRATIONS`.

## Tests

- **Tests drive `Game.handle` and assert on its replies**, per spec #2's Testing Decisions. Tests below that seam are allowed only for the cases recorded on issue #5. A new below-seam test needs a recorded reason.
