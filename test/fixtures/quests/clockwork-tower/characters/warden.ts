import { character } from '../../../../../src/builder.ts';

export default character({
	abilities: [{ name: 'Bulwark', text: 'Twice per Page: add +2 to a Defense roll.' }],
	id: 'warden',
	name: 'Iron Warden',
	stats: { attack: 3, damage: '2d4', defense: 4, maxHealth: 14 },
	traits: { strength: 3, dexterity: 0, constitution: 2, intellect: -1, wisdom: 0, charisma: 1 },
});
