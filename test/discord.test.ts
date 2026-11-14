import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import type { ActionRow, Component, MediaGallery, TextDisplay } from '../src/components.ts';
import { brokenLimits, toDiscord } from '../src/discord.ts';
import type { Image } from '../src/registry.ts';

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

test('a reply of exactly 4000 characters of text, counting texts inside boxes and sections, is within limits, and 4001 is not', () => {
	const section: Component = {
		accessory: row(1).components[0]!,
		components: [text('b'.repeat(1000))],
		type: 'section',
	};
	const box = (length: number): Component => ({ components: [text('a'.repeat(length)), section], type: 'container' });

	assert.deepEqual(brokenLimits({ components: [text('x'.repeat(1000)), box(2000)] }), []);
	assert.deepEqual(brokenLimits({ components: [text('x'.repeat(1000)), box(2001)] }), [
		'4,001 characters of text, more than the 4,000 Discord shows in one message',
	]);
});

test('a reply of exactly 40 components, counting each part inside another and each button, is within limits, and 41 is not', () => {
	// Each section is three components: itself, its text, and its button.
	const section: Component = { accessory: row(1).components[0]!, components: [text('x')], type: 'section' };
	// Each row of five buttons is six components.
	const parts: Component[] = [
		...Array.from({ length: 8 }, () => section),
		...Array.from({ length: 2 }, () => row(5)),
		{ type: 'separator' },
		{ type: 'separator' },
		{ type: 'separator' },
		{ type: 'separator' },
	];

	assert.deepEqual(brokenLimits({ components: parts }), []);
	assert.deepEqual(brokenLimits({ components: [...parts, { type: 'separator' }] }), [
		'41 components, more than the 40 Discord shows in one message',
	]);
});

test('a reply of 10 images, in galleries, thumbnails, or files, is within limits, and 11 is not', () => {
	const parts: Component[] = [
		...Array.from({ length: 8 }, (_, i) => gallery(image(`${i + 1}.png`))),
		{ accessory: { media: image('face.png'), type: 'thumbnail' }, components: [text('Tinker')], type: 'section' },
		{ file: image('notes.png'), type: 'file' },
	];

	assert.deepEqual(brokenLimits({ components: parts }), []);
	assert.deepEqual(brokenLimits({ components: [...parts, gallery(image('11.png'))] }), [
		'11 images, more than the 10 Discord attaches to one message',
	]);
});

test('the same image shown twice is attached once, so it counts once', () => {
	const map = image('map.png');

	assert.deepEqual(brokenLimits({ components: Array.from({ length: 11 }, () => gallery(map)) }), []);
});

test('a reply whose images pass 8 MiB together is not within limits', () => {
	const fourMiB = 4 * 1024 * 1024;
	const parts = [gallery(image('a.png', fourMiB)), gallery(image('b.png', fourMiB))];

	assert.deepEqual(brokenLimits({ components: parts }), []);
	assert.deepEqual(brokenLimits({ components: [...parts, gallery(image('c.png'))] }), [
		'images of 8,388,609 bytes together, more than the 8,388,608 Discord attaches to one message',
	]);
});

test('a reply that breaks a limit is not sent', () => {
	assert.throws(
		() => toDiscord({ components: [text('x'.repeat(4001))] }),
		/Reply breaks Discord's limits: 4,001 characters of text, more than the 4,000 Discord shows in one message/,
	);
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

	assert.deepEqual(Object.keys(message).sort(), ['components', 'content', 'embeds', 'files', 'flags']);
	// Discord turns a message into Components V2 only once its text and embeds are cleared,
	// such as a message the bot sent with embeds before it used Components V2.
	assert.equal(message.content, null);
	assert.deepEqual(message.embeds, []);
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
