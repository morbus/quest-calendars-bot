import { prose, quest } from '../../src/builder.ts';

export default quest({
	id: 'voidspark-chronicles-adventures-of-sd-247',
	name: 'The Voidspark Chronicles: Adventures of SD-247',
	image: 'quest.jpg',
	description: prose`
		Take on the role of SD-247, a ship drone aboard the _Argyle_, as it performs its
		daily duties to clean and maintain the ship. What a good little bot. _This is 
		a small sample quest to play before the year-long Voidspark Chronicles adventure._
	`,
	complete: false,
	currency: 'credits',
	reputation: 'Virtue',
	ruleModules: [],
	characters: [
		{
			id: 'sd-247',
			name: 'SD-247',
			image: 'characters/sd-247.png',
			description: prose`
				I am SD-247, a class II ship drone. The life forms on this ship call me "Es-Dee". They
				are fond of me, as I am loyal to my duties and serve them well. My responsibilities include
				minor electrical repairs, computer servicing, cleaning, sanitization, and extermination
				of invasive species. I have been servicing the _Argyle_ all my life and have only been
				off ship to repair the exterior.
			`,
			stats: { maxHealth: 16, defense: 1, attack: 3, damage: 'd6' },
			traits: { strength: -3, dexterity: 2, constitution: 2, intellect: 4, wisdom: -1, charisma: -2 },
			abilities: [
				{ name: 'Engineering', text: 'Add +3 to all rolls to build and repair devices.' },
				{ name: 'Computers', text: 'Add +3 to all rolls to operate computer systems.' },
				{ name: 'Overload', text: 'Once per Page, Add d6 to a single Attack roll.' },
				{ name: 'Blowtorch', text: 'Once per Page, Add d6 to a single Damage roll.' },
			],
		},
	],
});
