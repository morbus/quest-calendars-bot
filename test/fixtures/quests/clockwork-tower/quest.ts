import { quest } from '../../../../src/builder.ts';

export default quest({
	complete: false,
	currency: 'scrap',
	description: 'Climb a tower of gears before it strikes midnight.',
	id: 'clockwork-tower',
	image: 'tower.png',
	name: 'The Clockwork Tower',
	reputation: 'Virtue',
	ruleModules: ['crafting'],
});
