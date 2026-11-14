import { quest } from '../../../../src/builder.ts';

export default quest({
	complete: false,
	currency: 'scrap',
	id: 'clockwork-tower',
	meter: 'Virtue',
	name: 'The Clockwork Tower',
	ruleModules: ['meter'],
});
