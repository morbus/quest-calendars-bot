import { character } from '../../../../../src/builder.ts';

/**
 * Forty-five Abilities of about 120 characters each, about 5,400 in all, the longest text on the card,
 * so the card cuts the Abilities short and keeps the description whole.
 */
const abilities = Array.from({ length: 45 }, (_, i) => ({
	name: `Index ${i + 1} of 45`,
	text: 'Once per Page: name a book you have read, and add +1 to a roll that the book could help with.',
}));

export default character({
	abilities,
	description: 'Has catalogued every shelf, and remembers none of it.',
	id: 'archivist',
	name: 'The Archivist',
	stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
	traits: { strength: -1, dexterity: 0, constitution: 0, intellect: 3, wisdom: 2, charisma: 0 },
});
