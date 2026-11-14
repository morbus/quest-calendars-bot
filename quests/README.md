# Quests

Each Quest is a directory here, or in another directory that QUESTS_DIR lists (see `.env.example`), loaded when the bot starts (`docs/adr/0001-pages-are-declarative-typescript.md`).
The bot won't start while any Quest is invalid, and its error names the file at fault.

```
quests/
  clockwork-tower/
    quest.ts            export default quest({ ... })
    tower.png           an image, if the Quest has one
    characters/
      tinker.ts         export default character({ ... })
      tinker.png
      warden.ts
```

Quest directories and Character files whose names start with `.` are skipped.

`quest()` and `character()` come from `src/builder.ts`, whose types list every field.
`npm run typecheck` checks each field of a Quest in `quests/` as you write it, and startup checks every field of every Quest again.
A Quest in another directory imports `src/builder.ts` from where this project is, and only startup checks it.

## quest.ts

```ts
import { quest } from '../../src/builder.ts';

export default quest({
	complete: false,
	currency: 'scrap',
	description: 'Climb a tower of gears before it strikes midnight.',
	id: 'clockwork-tower',
	image: 'tower.png',
	meter: 'Virtue',
	name: 'The Clockwork Tower',
	ruleModules: ['meter'],
});
```

- `complete`: `true` once you've finished writing the Quest.
- `currency`: what the Quest's Currency is called, such as "gold" or "scrap".
- `description`: what Players read before they choose the Quest.
- `id`: lowercase letters and digits, with single hyphens between them, such as `clockwork-tower`, at most 64 characters. Keep it once Players have played the Quest.
- `image` (optional): see [Images](#images).
- `meter`: the meter's name, such as "Notoriety". Give one exactly when `ruleModules` turns on `meter`.
- `name`: what Players see, on one line of at most 80 characters.
- `ruleModules`: the optional Rule Modules the Quest turns on, each at most once: `exploration`, `meal-rations`, and `meter`. Use `[]` for none.

Every text, such as a name, a description, or the `currency`, must hold more than spaces.
No two Quests may share an id or a name, even across the directories QUESTS_DIR lists.
`/quest start` shows at most 25 Quests, so the bot won't start with more.

## characters/

Each `.ts` file in a Quest's `characters/` directory is one Character, and a Quest needs at least one.

```ts
import { character } from '../../../src/builder.ts';

export default character({
	abilities: [
		{ name: 'Gadgeteer', text: 'Once per Rest: add d4 to an Intellect roll.' },
		{ name: 'Spare Parts', text: 'Add +1 to rolls to repair.' },
	],
	description: 'Builds what the tower breaks.',
	id: 'tinker',
	image: 'tinker.png',
	name: 'Tinker',
	stats: { attack: 1, damage: 'd6', defense: 2, maxHealth: 10 },
	traits: { strength: -1, dexterity: 2, constitution: 0, intellect: 3, wisdom: 1, charisma: 0 },
});
```

- `description`, `id`, `image`, and `name`: as in `quest.ts`. No two Characters in one Quest may share an id or a name.
- `stats`: the starting Stats. `maxHealth` is a whole number of at least 1. `attack` and `defense` are whole numbers. `damage` is dice, such as `d6` or `2d4`.
- `traits`: the starting Traits, each a whole number: `strength`, `dexterity`, `constitution`, `intellect`, `wisdom`, and `charisma`.
- `abilities`: the starting Abilities, each a `name` and the `text` Players read, in the order Players see them. Use `[]` for none.

## Images

A Quest or a Character can show an image, such as a map or a portrait.
`image` names a `.gif`, `.jpeg`, `.jpg`, `.png`, or `.webp` file relative to the file that names it, of at most 8 MiB, the most Discord takes in one message.
The bot reads images when it starts, so restart it after you change one.
