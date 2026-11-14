import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDiscord, toMessages } from '../src/discord.ts';
import type { Button, Card } from '../src/game.ts';
import type { Image } from '../src/registry.ts';

/**
 * An image named `name`, of `bytes` bytes.
 */
function image(name: string, bytes = 1): Image {
	return { data: Buffer.alloc(bytes), name };
}

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
			{ image: image('tower.png'), text: long },
			{ image: image('road.png'), text: long },
		],
	});

	assert.deepEqual(messages, [
		{ buttonRows: [], content: `Choose.\n\n${long}`, files: [image('tower.png')] },
		{ buttonRows: [], content: long, files: [image('road.png')] },
	]);
});

test('a message holds at most 10 images', () => {
	const sections = Array.from({ length: 11 }, (_, i) => ({ image: image(`${i + 1}.png`), text: `${i + 1}` }));

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
	const messages = toMessages({ sections: [{ image: image('tower.png'), text: 'x'.repeat(2500) }] });

	assert.deepEqual(
		messages.map((message) => message.files),
		[[image('tower.png')], []],
	);
});

test('a section split at 2000 characters keeps each emoji whole', () => {
	const messages = toMessages({ sections: [{ text: `a${'🐉'.repeat(1500)}` }] });

	assert.deepEqual(
		messages.map((message) => message.content),
		[`a${'🐉'.repeat(999)}`, '🐉'.repeat(501)],
	);
});

test('a section split at 2000 characters keeps emoji made of several characters whole, such as flags', () => {
	const messages = toMessages({ sections: [{ text: `a${'🇫🇷'.repeat(600)}` }] });

	assert.deepEqual(
		messages.map((message) => message.content),
		[`a${'🇫🇷'.repeat(499)}`, '🇫🇷'.repeat(101)],
	);
});

test('a single character longer than a message is cut at 2000', () => {
	// One letter with 2500 accents is one character as a reader sees it.
	const messages = toMessages({ sections: [{ text: `e${'́'.repeat(2500)}` }] });

	assert.deepEqual(
		messages.map((message) => message.content.length),
		[2000, 501],
	);
});

test('a split that leaves only blank text sends no empty message', () => {
	const messages = toMessages({ sections: [{ text: `${'x'.repeat(2000)}\n\n` }] });

	assert.deepEqual(
		messages.map((message) => message.content),
		['x'.repeat(2000)],
	);
});

test('images that together go over 8 MiB start a new message', () => {
	const fourMiB = 4 * 1024 * 1024;
	const sections = [
		{ image: image('a.png', fourMiB), text: 'A' },
		{ image: image('b.png', fourMiB), text: 'B' },
		{ image: image('c.png', 1), text: 'C' },
	];

	const messages = toMessages({ sections });

	assert.deepEqual(
		messages.map((message) => message.content),
		['A\n\nB', 'C'],
	);
});

test('sections that would join to 2001 characters, counting the blank line, go in two messages', () => {
	const messages = toMessages({ sections: [{ text: 'x'.repeat(999) }, { text: 'y'.repeat(1000) }] });

	assert.deepEqual(
		messages.map((message) => message.content.length),
		[999, 1000],
	);
});

test("a message's images are sent as attachments with their bytes and names, its buttons as rows, and no embed", () => {
	const tower = { data: Buffer.from('tower bytes'), name: 'tower.png' };

	const { components, content, embeds, files } = toDiscord({
		buttonRows: [buttons(2)],
		content: 'Choose.',
		files: [tower],
	});

	assert.equal(content, 'Choose.');
	// An empty list, not none, so a reply that replaces a card clears it.
	assert.deepEqual(embeds, []);
	assert.deepEqual(files, [{ attachment: Buffer.from('tower bytes'), name: 'tower.png' }]);
	// What Discord receives, as discord.js serializes it.
	assert.deepEqual(JSON.parse(JSON.stringify(components)), [
		{
			components: [
				{ custom_id: 'b1', disabled: false, label: 'Button 1', style: 1, type: 2 },
				{ custom_id: 'b2', disabled: false, label: 'Button 2', style: 1, type: 2 },
			],
			type: 1,
		},
	]);
});

test("a reply's card goes on its last message, with the buttons, and its image is attached there", () => {
	const card = { description: 'Climb.', fields: [], footer: 'Quest 2 of 2', image: image('tower.png'), title: 'Tower' };

	const messages = toMessages({ buttons: buttons(3), card, sections: [{ text: 'Choose a Quest.' }] });

	assert.deepEqual(messages, [
		{ buttonRows: [buttons(3)], card, content: 'Choose a Quest.', files: [image('tower.png')] },
	]);
});

test('a reply with a card and no text is still one message', () => {
	const card = { description: 'Climb.', fields: [], footer: 'Quest 1 of 1', title: 'Tower' };

	const messages = toMessages({ buttons: buttons(1), card, sections: [] });

	assert.deepEqual(messages, [{ buttonRows: [buttons(1)], card, content: '', files: [] }]);
});

test("a card is sent as an embed showing its attached image, and a disabled button can't be pressed", () => {
	const map = { data: Buffer.from('map bytes'), name: 'carte du ✨ monde.png' };
	const card = {
		description: 'Climb.',
		fields: [{ name: 'Stats', value: 'Max Health 10' }],
		footer: 'Quest 1 of 2',
		image: map,
		title: 'Tower',
	};

	const { components, embeds, files } = toDiscord({
		buttonRows: [[{ disabled: true, id: 'prev', label: 'Previous' }]],
		card,
		content: '',
		files: [map],
	});

	assert.deepEqual(JSON.parse(JSON.stringify(embeds)), [
		{
			description: 'Climb.',
			fields: [{ name: 'Stats', value: 'Max Health 10' }],
			footer: { text: 'Quest 1 of 2' },
			image: { url: 'attachment://carte_du___monde.png' },
			title: 'Tower',
		},
	]);
	assert.deepEqual(files, [{ attachment: Buffer.from('map bytes'), name: 'carte_du___monde.png' }]);
	assert.equal(JSON.parse(JSON.stringify(components))[0].components[0].disabled, true);
});

/**
 * The embed `toDiscord` builds for a message showing `card`, as Discord receives it.
 */
function embedFor(card: Card) {
	const { embeds } = toDiscord({ buttonRows: [], card, content: '', files: [] });
	return JSON.parse(JSON.stringify(embeds))[0];
}

test("a card's description and fields are cut short, with an ellipsis, to fit an embed", () => {
	const embed = embedFor({
		description: 'd'.repeat(5000),
		fields: [{ name: 'Abilities', value: 'a'.repeat(2000) }],
		footer: 'Quest 1 of 1',
		title: 'Tower',
	});

	assert.equal(embed.description, `${'d'.repeat(4095)}…`);
	assert.equal(embed.fields[0].value, `${'a'.repeat(1023)}…`);
});

test('a card whose parts each fit but together pass 6000 characters has its description cut to fit', () => {
	const fields = ['Stats', 'Traits', 'Abilities'].map((name) => ({ name, value: 'v'.repeat(1000) }));

	const embed = embedFor({ description: 'd'.repeat(4000), fields, footer: 'Quest 1 of 1', title: 'Tower' });

	const length = [embed.title, embed.description, embed.footer.text, ...fields.flatMap((f) => [f.name, f.value])].join(
		'',
	).length;
	assert.equal(length, 6000);
	assert.ok(embed.description.endsWith('…'));
});

test("a card whose image doesn't fit with the last message's images starts a new message", () => {
	const sections = Array.from({ length: 10 }, (_, i) => ({ image: image(`${i + 1}.png`), text: `${i + 1}` }));
	const card = { description: 'Climb.', fields: [], footer: 'Quest 1 of 1', image: image('tower.png'), title: 'Tower' };

	const messages = toMessages({ buttons: buttons(1), card, sections });

	assert.deepEqual(
		messages.map((message) => ({
			buttons: message.buttonRows.length,
			card: message.card?.title,
			files: message.files.length,
		})),
		[
			{ buttons: 0, card: undefined, files: 10 },
			{ buttons: 1, card: 'Tower', files: 1 },
		],
	);
});

test("a card's description is cut between graphemes, so an emoji at the limit is left out whole", () => {
	const embed = embedFor({ description: `${'x'.repeat(4094)}🇯🇵`, fields: [], footer: 'Quest 1 of 1', title: 'Tower' });

	assert.equal(embed.description, `${'x'.repeat(4094)}…`);
});
