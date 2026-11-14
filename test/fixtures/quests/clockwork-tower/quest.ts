import { quest } from '../../../../src/builder.ts';

export default quest({
	complete: false,
	currency: 'scrap',
	description: 'Climb a tower of gears before it strikes midnight.',
	id: 'clockwork-tower',
	image: 'tower.png',
	meter: 'Virtue',
	name: 'The Clockwork Tower',
	ruleModules: ['meter'],
});
