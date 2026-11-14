import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import type { ActionRow, Component, MediaGallery, TextDisplay } from '../src/components.ts';
import { toDiscord, toMessages, type Message } from '../src/discord.ts';
import { fileURLToPath } from 'node:url';
import { createGame } from '../src/game.ts';
import { loadQuests, type Image } from '../src/registry.ts';
import { openStorage } from '../src/storage.ts';

/**
 * An image named `name`, of `bytes` bytes.
 */
function image(name: string, bytes = 1): Image {
	return { data: Buffer.alloc(bytes), name };
}

/**
 * A {@link TextDisplay} of `content`.
 */
function text(content: string): TextDisplay {
	return { content, type: 'textDisplay' };
}

/**
 * A row of `count` buttons, with ids b1 and on.
 */
function row(count: number): ActionRow {
	const components = Array.from({ length: count }, (_, i) => ({
		id: `b${i + 1}`,
		label: `Button ${i + 1}`,
		type: 'button' as const,
	}));
	return { components, type: 'actionRow' };
}

/**
 * A gallery of `images`.
 */
function gallery(...images: Image[]): MediaGallery {
	return { items: images.map((media) => ({ media })), type: 'mediaGallery' };
}

/**
 * The text of each top-level text in each message.
 */
function textsOf(messages: Message[]): string[][] {
	return messages.map((message) => message.components.map((part) => (part.type === 'textDisplay' ? part.content : '')));
}

test('a reply that fits in one message is one message, with its parts as the Game laid them out', () => {
	const components: Component[] = [
		text('Choose a Quest.'),
		{ components: [gallery(image('tower.png')), text('## Tower\nClimb.')], type: 'container' },
		row(3),
	];

	assert.deepEqual(toMessages({ components }), [{ components }]);
});

test('texts that together pass 4000 characters start a new message', () => {
	const messages = toMessages({ components: [text('x'.repeat(1500)), text('y'.repeat(1500)), text('z'.repeat(1500))] });

	assert.deepEqual(textsOf(messages), [['x'.repeat(1500), 'y'.repeat(1500)], ['z'.repeat(1500)]]);
});

test('texts of exactly 4000 characters together stay in one message, and 4001 go in two', () => {
	const exactly = toMessages({ components: [text('x'.repeat(2000)), text('y'.repeat(2000))] });
	const over = toMessages({ components: [text('x'.repeat(2000)), text('y'.repeat(2001))] });

	assert.equal(exactly.length, 1);
	assert.equal(over.length, 2);
});

test('a text over 4000 characters is split at its last line break that fits, or else at 4000', () => {
	const lines = ['a'.repeat(2400), 'b'.repeat(2400), 'c'.repeat(5000)].join('\n');

	const messages = toMessages({ components: [text(lines)] });

	assert.deepEqual(textsOf(messages), [['a'.repeat(2400)], ['b'.repeat(2400)], ['c'.repeat(4000)], ['c'.repeat(1000)]]);
});

test('a text split at 4000 characters keeps each emoji whole', () => {
	const messages = toMessages({ components: [text(`a${'🐉'.repeat(3000)}`)] });

	assert.deepEqual(textsOf(messages), [[`a${'🐉'.repeat(1999)}`], ['🐉'.repeat(1001)]]);
});

test('a text split at 4000 characters keeps emoji made of several characters whole, such as flags', () => {
	const messages = toMessages({ components: [text(`a${'🇫🇷'.repeat(1200)}`)] });

	assert.deepEqual(textsOf(messages), [[`a${'🇫🇷'.repeat(999)}`], ['🇫🇷'.repeat(201)]]);
});

test('a single character longer than a message is cut at 4000', () => {
	// One letter with 5000 accents is one character as a reader sees it.
	const messages = toMessages({ components: [text(`e${'́'.repeat(5000)}`)] });

	assert.deepEqual(
		textsOf(messages).map(([content]) => content?.length),
		[4000, 1001],
	);
});

test('a split that leaves only blank text sends no empty text', () => {
	const messages = toMessages({ components: [text(`${'x'.repeat(4000)}\n\n`)] });

	assert.deepEqual(textsOf(messages), [['x'.repeat(4000)]]);
});

test('parts of exactly 40 components, counting what each section holds, stay in one message, and 41 go in two', () => {
	// Each section is three components: itself, its text, and its button.
	const section: Component = { accessory: row(1).components[0]!, components: [text('x')], type: 'section' };
	const sections = Array.from({ length: 13 }, () => section);
	const separator: Component = { type: 'separator' };

	const exactly = toMessages({ components: [...sections, separator] });
	const over = toMessages({ components: [...sections, separator, separator] });

	assert.equal(exactly.length, 1);
	assert.deepEqual(
		over.map((message) => message.components.length),
		[14, 1],
	);
});

test('parts that together attach more than 10 images, in galleries, thumbnails, or files, start a new message', () => {
	const components: Component[] = [
		...Array.from({ length: 9 }, (_, i) => gallery(image(`${i + 1}.png`))),
		{
			accessory: { media: image('face.png'), type: 'thumbnail' },
			components: [text('Tinker')],
			type: 'section',
		},
		{ file: image('notes.png'), type: 'file' },
	];

	const messages = toMessages({ components });

	assert.deepEqual(
		messages.map((message) => message.components.length),
		[10, 1],
	);
});

test('the same image shown twice is attached once, so it counts once', () => {
	const map = image('map.png');
	const components = Array.from({ length: 11 }, () => gallery(map));

	assert.equal(toMessages({ components }).length, 1);
});

test('images that together pass 8 MiB start a new message', () => {
	const fourMiB = 4 * 1024 * 1024;
	const components = [gallery(image('a.png', fourMiB)), gallery(image('b.png', fourMiB)), gallery(image('c.png'))];

	const messages = toMessages({ components });

	assert.deepEqual(
		messages.map((message) => message.components.length),
		[2, 1],
	);
});

test('a box whose texts pass 4000 characters on their own has its longest text cut, with an ellipsis, to fit', () => {
	const box: Component = {
		components: [
			text('## Tower'),
			{ accessory: row(1).components[0]!, components: [text('d'.repeat(5000))], type: 'section' },
		],
		type: 'container',
	};

	const [message, ...rest] = toMessages({ components: [box] });

	assert.deepEqual(rest, []);
	assert.deepEqual(message, {
		components: [
			{
				components: [
					text('## Tower'),
					{ accessory: row(1).components[0], components: [text(`${'d'.repeat(3991)}…`)], type: 'section' },
				],
				type: 'container',
			},
		],
	});
});

test('a box too long for a message is cut to the room the texts before it leave, so it stays with them and its buttons', () => {
	const box: Component = { components: [text('## Tower'), text('d'.repeat(5000))], type: 'container' };

	const messages = toMessages({ components: [text('Choose a Quest.'), box, row(3)] });

	assert.deepEqual(messages, [
		{
			components: [
				text('Choose a Quest.'),
				{ components: [text('## Tower'), text(`${'d'.repeat(3976)}…`)], type: 'container' },
				row(3),
			],
		},
	]);
});

test('a box that fits in a message of its own goes there whole, rather than cut to the room left', () => {
	const box: Component = { components: [text('d'.repeat(3000))], type: 'container' };

	const messages = toMessages({ components: [text('x'.repeat(2000)), box] });

	assert.deepEqual(messages, [{ components: [text('x'.repeat(2000))] }, { components: [box] }]);
});

test('a box that cannot be cut to the room left starts a new message, cut to fit it', () => {
	const box: Component = { components: [text('## The Clockwork Tower'), text('d'.repeat(5000))], type: 'container' };

	const messages = toMessages({ components: [text('x'.repeat(3990)), box] });

	assert.deepEqual(messages, [
		{ components: [text('x'.repeat(3990))] },
		{ components: [{ components: [text('## The Clockwork Tower'), text(`${'d'.repeat(3977)}…`)], type: 'container' }] },
	]);
});

test('a box still too long with its longest text cut short has its next longest cut too', () => {
	const box: Component = {
		components: [text('a'.repeat(2500)), text('b'.repeat(2500)), text('c'.repeat(2500))],
		type: 'container',
	};

	const [message, ...rest] = toMessages({ components: [box] });

	assert.deepEqual(rest, []);
	assert.deepEqual(message?.components, [
		{ components: [text('…'), text(`${'b'.repeat(1498)}…`), text('c'.repeat(2500))], type: 'container' },
	]);
});

test('a box whose texts are too many to cut short enough is left whole, rather than cut forever', () => {
	const box: Component = { components: Array.from({ length: 4001 }, () => text('x')), type: 'container' };

	assert.deepEqual(toMessages({ components: [box] }), [{ components: [box] }]);
});

test('a cut text is cut between graphemes, so an emoji at the limit is left out whole', () => {
	const box: Component = { components: [text(`${'x'.repeat(3997)}🇯🇵yy`)], type: 'container' };

	const [message] = toMessages({ components: [box] });

	assert.deepEqual(message?.components, [{ components: [text(`${'x'.repeat(3997)}…`)], type: 'container' }]);
});

test('a Quest and Characters with texts too long for Discord each show in one message, with the longest text cut', async () => {
	const quests = await loadQuests([fileURLToPath(new URL('fixtures/long-quests/', import.meta.url))]);
	const game = createGame({ quests, storage: openStorage(':memory:') });
	const press = (button: string) => game.handle('player-1', null, { button }, new Date()).reply;
	const replies = [
		game.handle('player-1', null, { command: 'quest start' }, new Date()).reply,
		press('quest:endless-library'),
		press('next:characters:endless-library:1'),
	];

	const cutTexts = replies.map((reply) => {
		const messages = toMessages(reply);
		assert.equal(messages.length, 1);
		const box = messages[0]!.components[1]!;
		assert.equal(box.type, 'container');
		return box.type === 'container'
			? box.components.flatMap((part) =>
					part.type === 'textDisplay' && part.content.endsWith('…') ? [part.content.split('\n')[0]] : [],
				)
			: [];
	});

	// The cut text in each: the Quest's description, the Archivist's Abilities, and the Reader's description.
	assert.deepEqual(cutTexts, [['## The Endless Library'], ['**Abilities**'], ['## The Reader']]);
});

/**
 * What Discord receives for `value`, as discord.js serializes it.
 */
function serialized(value: unknown) {
	return JSON.parse(JSON.stringify(value));
}

test('every part is sent as its Discord counterpart, with the options it sets, as Components V2', () => {
	const map = image('map.png');
	const portrait = image('portrait.png');
	const notes = image('notes.png');

	const message = toDiscord({
		components: [
			text('Choose.'),
			{
				accentColor: 0xd4a017,
				components: [
					{ items: [{ description: 'A map', media: map, spoiler: true }, { media: portrait }], type: 'mediaGallery' },
					{
						accessory: { description: 'A face', media: portrait, spoiler: true, type: 'thumbnail' },
						components: [text('## Tinker'), text('Builds.')],
						type: 'section',
					},
					{
						accessory: { label: 'Rules', type: 'linkButton', url: 'https://example.com/rules' },
						components: [text('Read.')],
						type: 'section',
					},
					{ divider: false, spacing: 'large', type: 'separator' },
					{ type: 'separator' },
					{ file: notes, spoiler: true, type: 'file' },
					{ file: notes, type: 'file' },
				],
				spoiler: true,
				type: 'container',
			},
			{
				components: [
					{ id: 'go', label: 'Go', type: 'button' },
					{ disabled: true, emoji: '🎲', id: 'roll', label: 'Roll', style: 'success', type: 'button' },
					{ id: 'quit', label: 'Quit', style: 'danger', type: 'button' },
					{ id: 'back', label: 'Back', style: 'secondary', type: 'button' },
					{ disabled: true, emoji: '📖', label: 'Rules', type: 'linkButton', url: 'https://example.com/rules' },
				],
				type: 'actionRow',
			},
		],
	});

	assert.deepEqual(Object.keys(message).sort(), ['components', 'files', 'flags']);
	assert.equal(message.flags, MessageFlags.IsComponentsV2);
	assert.deepEqual(message.files, [
		{ attachment: map.data, name: 'map.png' },
		{ attachment: portrait.data, name: 'portrait.png' },
		{ attachment: notes.data, name: 'notes.png' },
	]);
	assert.deepEqual(serialized(message.components), [
		{ content: 'Choose.', type: 10 },
		{
			accent_color: 0xd4a017,
			components: [
				{
					items: [
						{ description: 'A map', media: { url: 'attachment://map.png' }, spoiler: true },
						{ media: { url: 'attachment://portrait.png' } },
					],
					type: 12,
				},
				{
					accessory: { description: 'A face', media: { url: 'attachment://portrait.png' }, spoiler: true, type: 11 },
					components: [
						{ content: '## Tinker', type: 10 },
						{ content: 'Builds.', type: 10 },
					],
					type: 9,
				},
				{
					accessory: { label: 'Rules', style: 5, type: 2, url: 'https://example.com/rules' },
					components: [{ content: 'Read.', type: 10 }],
					type: 9,
				},
				{ divider: false, spacing: 2, type: 14 },
				{ type: 14 },
				{ file: { url: 'attachment://notes.png' }, spoiler: true, type: 13 },
				{ file: { url: 'attachment://notes.png' }, type: 13 },
			],
			spoiler: true,
			type: 17,
		},
		{
			components: [
				{ custom_id: 'go', label: 'Go', style: 1, type: 2 },
				{ custom_id: 'roll', disabled: true, emoji: { name: '🎲' }, label: 'Roll', style: 3, type: 2 },
				{ custom_id: 'quit', label: 'Quit', style: 4, type: 2 },
				{ custom_id: 'back', label: 'Back', style: 2, type: 2 },
				{ disabled: true, emoji: { name: '📖' }, label: 'Rules', style: 5, type: 2, url: 'https://example.com/rules' },
			],
			type: 1,
		},
	]);
});

test('images are attached under names Discord can link to, and two different images with one name get different names', () => {
	const tower = image('carte du ✨ monde.png');
	const first = { data: Buffer.from('first'), name: 'map.png' };
	const second = { data: Buffer.from('second'), name: 'map.png' };

	const message = toDiscord({ components: [gallery(tower, first, second)] });

	assert.deepEqual(
		message.files.map(({ name }) => name),
		['carte_du___monde.png', 'map.png', '2-map.png'],
	);
	assert.deepEqual(
		serialized(message.components)[0].items.map(({ media }: { media: { url: string } }) => media.url),
		['attachment://carte_du___monde.png', 'attachment://map.png', 'attachment://2-map.png'],
	);
});
