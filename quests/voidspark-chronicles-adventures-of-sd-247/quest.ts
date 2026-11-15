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
});
