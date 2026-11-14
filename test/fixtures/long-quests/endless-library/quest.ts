import { quest } from '../../../../src/builder.ts';

/**
 * Twelve numbered paragraphs of about 500 characters each, about 6,000 in all, so the card cuts the
 * description short and the last paragraph number shown says where the cut fell.
 */
const shelves = Array.from(
	{ length: 12 },
	(_, i) =>
		`**Shelf ${i + 1} of 12.** ${'The shelves go on further than any lamp can reach, and every book on them tells a different story. '.repeat(5)}`,
);

export default quest({
	complete: false,
	currency: 'ink',
	description: shelves.join('\n\n'),
	id: 'endless-library',
	name: 'The Endless Library',
	ruleModules: [],
});
