import { character } from '../../../../../src/builder.ts';

export default character({
	abilities: [
		{ name: 'Gadgeteer', text: 'Once per Rest: add d4 to an Intellect roll.' },
		{ name: 'Spare Parts', text: 'Add +1 to rolls to repair.' },
	],
	description: 'Builds what the tower breaks.',
	id: 'tinker',
	name: 'Tinker',
	stats: { attack: 1, damage: 'd6', defense: 2, maxHealth: 10 },
	traits: { strength: -1, dexterity: 2, constitution: 0, intellect: 3, wisdom: 1, charisma: 0 },
});
