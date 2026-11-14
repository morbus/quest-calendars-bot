import { character } from '../../../../../src/builder.ts';

/**
 * Six numbered paragraphs of about 500 characters each, about 3,000 in all.
 */
const paragraphs = Array.from(
	{ length: 6 },
	(_, i) =>
		`**Page ${i + 1} of 6.** ${'She reads every book to its last page, even the ones that have no last page. '.repeat(6)}`,
);

/**
 * Twenty Abilities of about 110 characters each, about 2,200 in all. Neither these nor the description is
 * more text than one Discord message shows, but together they are, so startup refuses this Character.
 */
const abilities = Array.from({ length: 20 }, (_, i) => ({
	name: `Bookmark ${i + 1} of 20`,
	text: 'Once per Rest: reroll a Wisdom roll, and keep either result.',
}));

export default character({
	abilities,
	description: paragraphs.join('\n\n'),
	id: 'reader',
	name: 'The Reader',
	stats: { attack: 1, damage: 'd6', defense: 0, maxHealth: 10 },
	traits: { strength: 0, dexterity: 1, constitution: 0, intellect: 2, wisdom: 3, charisma: -1 },
});
