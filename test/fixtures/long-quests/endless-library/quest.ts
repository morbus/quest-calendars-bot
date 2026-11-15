import { quest } from '../../../../src/builder.ts';

/**
 * Twelve numbered paragraphs of about 500 characters each, about 6,000 in all: more text than one Discord
 * message shows, so startup refuses this Quest.
 */
const shelves = Array.from(
	{ length: 12 },
	(_, i) =>
		`**Shelf ${i + 1} of 12.** ${'The shelves go on further than any lamp can reach, and every book on them tells a different story. '.repeat(5)}`,
);

/**
 * Forty-five Abilities of about 120 characters each, about 5,400 in all: more text than one Discord message
 * shows, though The Archivist's description is short, so startup refuses The Archivist.
 */
const indexes = Array.from({ length: 45 }, (_, i) => ({
	name: `Index ${i + 1} of 45`,
	text: 'Once per Page: name a book you have read, and add +1 to a roll that the book could help with.',
}));

/**
 * Six numbered paragraphs of about 500 characters each, about 3,000 in all.
 */
const pages = Array.from(
	{ length: 6 },
	(_, i) =>
		`**Page ${i + 1} of 6.** ${'She reads every book to its last page, even the ones that have no last page. '.repeat(6)}`,
);

/**
 * Twenty Abilities of about 110 characters each, about 2,200 in all. Neither these nor The Reader's description is
 * more text than one Discord message shows, but together they are, so startup refuses The Reader.
 */
const bookmarks = Array.from({ length: 20 }, (_, i) => ({
	name: `Bookmark ${i + 1} of 20`,
	text: 'Once per Rest: reroll a Wisdom roll, and keep either result.',
}));

export default quest({
	characters: [
		{
			abilities: indexes,
			description: 'Has catalogued every shelf, and remembers none of it.',
			id: 'archivist',
			name: 'The Archivist',
			stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
			traits: { strength: -1, dexterity: 0, constitution: 0, intellect: 3, wisdom: 2, charisma: 0 },
		},
		{
			abilities: bookmarks,
			description: pages.join('\n\n'),
			id: 'reader',
			name: 'The Reader',
			stats: { attack: 1, damage: 'd6', defense: 0, maxHealth: 10 },
			traits: { strength: 0, dexterity: 1, constitution: 0, intellect: 2, wisdom: 3, charisma: -1 },
		},
	],
	complete: false,
	currency: 'ink',
	description: shelves.join('\n\n'),
	id: 'endless-library',
	name: 'The Endless Library',
	reputation: 'Renown',
	ruleModules: [],
});
