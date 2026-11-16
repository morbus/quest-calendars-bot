import { quest } from '../../../../src/builder.ts';

export default quest({
	characters: [
		{
			abilities: [],
			description: 'Walks the road for reasons of their own.',
			id: 'pilgrim',
			name: 'Pilgrim',
			stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
			traits: { strength: 0, dexterity: 0, constitution: 1, intellect: 0, wisdom: 2, charisma: 1 },
		},
	],
	complete: true,
	currency: 'gold',
	description: 'A pilgrimage along the old trade road.',
	id: 'amber-road',
	name: 'The Amber Road',
	reputation: 'Piety',
	ruleModules: [],
});
