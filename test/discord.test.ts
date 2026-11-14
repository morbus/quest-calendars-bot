import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMessages } from '../src/discord.ts';
import type { Button } from '../src/game.ts';

/**
 * `count` buttons, with ids b1 and on.
 */
function buttons(count: number): Button[] {
	return Array.from({ length: count }, (_, i) => ({ id: `b${i + 1}`, label: `Button ${i + 1}` }));
}

test('a short reply is one message, with a blank line between sections and buttons in rows of five', () => {
	const messages = toMessages({ buttons: buttons(6), sections: [{ text: 'One.' }, { text: 'Two.' }] });

	assert.deepEqual(messages, [
		{
			buttonRows: [buttons(6).slice(0, 5), buttons(6).slice(5)],
			content: 'One.\n\nTwo.',
			files: [],
		},
	]);
});

test('sections that together go over 2000 characters start a new message, and buttons go on the last', () => {
	const long = 'x'.repeat(1500);

	const messages = toMessages({ buttons: buttons(1), sections: [{ text: long }, { text: long }, { text: 'End.' }] });

	assert.deepEqual(messages, [
		{ buttonRows: [], content: long, files: [] },
		{ buttonRows: [buttons(1)], content: `${long}\n\nEnd.`, files: [] },
	]);
});

test("a section's image is attached to the message that holds its text", () => {
	const long = 'x'.repeat(1500);

	const messages = toMessages({
		sections: [
			{ text: 'Choose.' },
			{ image: '/quests/tower.png', text: long },
			{ image: '/quests/road.png', text: long },
		],
	});

	assert.deepEqual(messages, [
		{ buttonRows: [], content: `Choose.\n\n${long}`, files: ['/quests/tower.png'] },
		{ buttonRows: [], content: long, files: ['/quests/road.png'] },
	]);
});

test('a message holds at most 10 images', () => {
	const sections = Array.from({ length: 11 }, (_, i) => ({ image: `/quests/${i + 1}.png`, text: `${i + 1}` }));

	const messages = toMessages({ sections });

	assert.deepEqual(
		messages.map((message) => message.files.length),
		[10, 1],
	);
});

test('a section over 2000 characters is split at its last line break that fits, or else at 2000', () => {
	const lines = ['a'.repeat(1200), 'b'.repeat(1200), 'c'.repeat(2500)].join('\n');

	const messages = toMessages({ sections: [{ text: lines }] });

	assert.deepEqual(
		messages.map((message) => message.content),
		['a'.repeat(1200), 'b'.repeat(1200), 'c'.repeat(2000), 'c'.repeat(500)],
	);
});

test('sections that join to exactly 2000 characters stay in one message', () => {
	const messages = toMessages({ sections: [{ text: 'x'.repeat(999) }, { text: 'y'.repeat(999) }] });

	assert.deepEqual(
		messages.map((message) => message.content.length),
		[2000],
	);
});

test("a split section's image is attached once, to its first part", () => {
	const messages = toMessages({ sections: [{ image: '/quests/tower.png', text: 'x'.repeat(2500) }] });

	assert.deepEqual(
		messages.map((message) => message.files),
		[['/quests/tower.png'], []],
	);
});

test('a section split at 2000 characters keeps each emoji whole', () => {
	const messages = toMessages({ sections: [{ text: `a${'🐉'.repeat(1500)}` }] });

	assert.deepEqual(
		messages.map((message) => message.content),
		[`a${'🐉'.repeat(999)}`, '🐉'.repeat(501)],
	);
});
