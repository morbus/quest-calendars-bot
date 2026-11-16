import { quest } from '../../../../src/builder.ts';

export default quest({
	characters: [
		{
			abilities: [{ name: 'Bulwark', text: 'Twice per Page: add +2 to a Defense roll.' }],
			description: 'A guard who has never left her post.',
			id: 'warden',
			name: 'Iron Warden',
			stats: { attack: 3, damage: '2d4', defense: 4, maxHealth: 14 },
			traits: { strength: 3, dexterity: 0, constitution: 2, intellect: -1, wisdom: 0, charisma: 1 },
		},
		{
			abilities: [
				{ name: 'Gadgeteer', text: 'Once per Rest: add d4 to an Intellect roll.' },
				{ name: 'Spare Parts', text: 'Add +1 to rolls to repair.' },
			],
			description: 'Builds what the tower breaks.',
			id: 'tinker',
			image: 'tinker.PNG',
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
