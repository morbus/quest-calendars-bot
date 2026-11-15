import { prose, quest } from '../../src/builder.ts';

export default quest({
	id: 'adventures-of-sd-247',
	name: 'Adventures of SD-247',
	image: 'quest.jpg',
	description: prose`
		Take on the role of SD-247, a ship drone aboard the Argyle, as it performs its
		daily duties to clean and maintain the ship. What a good little bot.
	`,
	complete: false,
	currency: 'credits',
	reputation: 'Virtue',
	ruleModules: [],
});
