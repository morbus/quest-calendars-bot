# Quests

Each Quest is a directory here, or in another directory that QUESTS_DIR lists (see `.env.example`), loaded when the bot starts (`docs/adr/0001-pages-are-declarative-typescript.md`).
The bot won't start without at least one Quest, or while any Quest is invalid, and its error names the file at fault.

```
quests/
  clockwork-tower/
    quest.ts            export default quest({ ... }), with its Characters
    tower.png           an image, if the Quest has one
    tinker.png          a Character's image, if one has it
```

Quest directories whose names start with `.` are skipped.

`quest()` and `prose` come from `src/builder.ts`, whose types list every field.
`npm run typecheck` checks each field of a Quest in `quests/` as you write it, and startup checks every field of every Quest again.
A Quest in another directory imports `src/builder.ts` from where this project is, and only startup checks it.

## quest.ts

```ts
import { quest } from '../../src/builder.ts';

export default quest({
	characters: [
		{
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
		},
	],
	complete: false,
	currency: 'scrap',
	description: 'Climb a tower of gears before it strikes midnight.',
	id: 'clockwork-tower',
	image: 'tower.png',
	name: 'The Clockwork Tower',
	reputation: 'Virtue',
	ruleModules: ['crafting'],
});
```

- `characters`: the Characters Players choose from, at least one, in the order Players see them. See [Characters](#characters).
- `complete`: `true` once you've finished writing the Quest.
- `currency`: what the Quest's Currency is called, such as "gold" or "scrap".
- `description`: what Players read before they choose the Quest.
- `id`: letters a–z and digits 0–9, with single hyphens between them, such as `clockwork-tower`, at most 44 characters. Keep it once Players have played the Quest.
- `image` (optional): see [Images](#images).
- `name`: what Players see, on one line of at most 80 characters.
- `reputation`: what the Quest's Reputation is called, such as "Notoriety" or "Virtue".
- `ruleModules`: the optional Rule Modules the Quest turns on, each at most once: `crafting`, `meal-rations`, and `minions`. Use `[]` for none.

Every text, such as a name, a description, the `currency`, or the `reputation`, must hold more than spaces, tabs, or line breaks.
No two Quests may share an id or a name, even across the directories QUESTS_DIR lists.
Each Quest's and each Character's screen must fit in one Discord message: at most 4,000 characters of text in all, counting its name, description, and, for a Character, Stats, Traits, and Abilities, as well as its button labels and image descriptions.
The bot won't start while a screen is too long, and its error names the file, the Character's place and id in `characters` if it's a Character's screen, and how many characters the screen has.

## Characters

Each entry in a Quest's `characters` is one Character. An error about one names its place in the list and its id, such as `characters[1] (tinker): stats.maxHealth`, or only its place when the id itself is wrong.

- `description`, `id`, `image`, and `name`: as for the Quest. No two Characters in one Quest may share an id or a name.
- `stats`: the starting Stats. `maxHealth` is a whole number of at least 1. `attack` and `defense` are whole numbers. `damage` is dice, such as `d6` or `2d4`.
- `traits`: the starting Traits, each a whole number: `strength`, `dexterity`, `constitution`, `intellect`, `wisdom`, and `charisma`.
- `abilities`: the starting Abilities, each a `name` and the `text` Players read, in the order Players see them. Use `[]` for none.

## Long text

`prose` from `src/builder.ts` lets you write a long text, such as a description, across as many lines as you like.
A line break becomes a space and a blank line starts a new paragraph, so you can indent and wrap freely.

```ts
import { prose, quest } from '../../src/builder.ts';

export default quest({
	// …
	description: prose`
		Climb a tower of gears
		before it strikes midnight.

		Somewhere above, a bell waits.
	`,
});
```

Because every line break becomes a space, use a plain string, not `prose`, for text that needs its line breaks, such as a list.

## Images

A Quest or a Character can show an image, such as a map or a portrait.
`image` names a `.gif`, `.jpeg`, `.jpg`, `.png`, or `.webp` file relative to the Quest's directory, such as `tower.png` or `portraits/tinker.png`, of at most 8 MiB, the most Discord takes in one message.
A Quest is self-contained, so its images must be inside its own directory: not a file in another Quest, an absolute path, or a symbolic link that leads outside.
The bot reads images when it starts, so restart it after you change one.

Discord shows a Quest's or Character's image as a banner across the top of its box, as wide as the box: about 500 pixels across on a computer, and narrower on a phone.
For the best results:

- Make it wide, from 3:1 to 16:9, and about 1100 to 1200 pixels across, such as 1200 × 400. That stays sharp on high-density screens without making the file needlessly large.
- Keep the subject away from the far edges, and avoid small text and fine detail, which are hard to read on a phone.
- Make it at least as wide as the box. Discord may show a narrower image at its own size against the left edge, rather than centered.
- Keep the file to a few hundred KB. 8 MiB is the most the bot accepts, not a size to aim for.
