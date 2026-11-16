import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prose } from '../src/builder.ts';

test('prose joins indented lines into one paragraph', () => {
	const text = prose`
		Climb a tower of gears
		before it strikes midnight.
	`;

	assert.equal(text, 'Climb a tower of gears before it strikes midnight.');
});

test('prose starts a new paragraph at each blank line', () => {
	const text = prose`
		The gears turn
		overhead.

		Somewhere above, a bell waits.
	`;

	assert.equal(text, 'The gears turn overhead.\n\nSomewhere above, a bell waits.');
});

test('prose ignores extra blank lines around and between paragraphs', () => {
	const text = prose`

		The gears turn.


		A bell waits.

	`;

	assert.equal(text, 'The gears turn.\n\nA bell waits.');
});

test('prose keeps the values written into it', () => {
	const floors = 12;

	const text = prose`
		The tower has
		${floors} floors.
	`;

	assert.equal(text, 'The tower has 12 floors.');
});

test('prose starts a new paragraph at a blank line that holds only indentation', () => {
	const text = prose`The gears turn.\n\t\t\nA bell waits.`;

	assert.equal(text, 'The gears turn.\n\nA bell waits.');
});

test('prose turns escaped backticks into the backticks Discord shows as code', () => {
	const text = prose`
		Run \`/quest start\` to begin.
	`;

	assert.equal(text, 'Run `/quest start` to begin.');
});
