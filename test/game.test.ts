import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Button, Component } from '../src/components.ts';
import { createGame, type Game, type Reply } from '../src/game.ts';
import { loadQuests, MAX_ID_LENGTH, type Image, type Quest } from '../src/registry.ts';
import { openStorage } from '../src/storage.ts';

/**
 * The fixed time every test runs at, unless it moves the clock itself.
 */
const NOW = new Date('2026-11-13T09:00:00Z');

/**
 * The fixture Quests: The Clockwork Tower, with two Characters, and The Amber Road, with one.
 */
const QUESTS = await loadQuests([fileURLToPath(new URL('fixtures/quests/', import.meta.url))]);

/**
 * An image file in the fixture Quests, as a Reply carries it.
 */
function image(path: string): Image {
	return { data: readFileSync(new URL(`fixtures/quests/${path}`, import.meta.url)), name: basename(path) };
}

/**
 * Every part of `reply`, and every part inside them, in the order the Player sees them.
 */
function allParts(reply: Reply): Component[] {
	const all: Component[] = [];
	const visit = (parts: Component[]) => {
		for (const part of parts) {
			all.push(part);
			if (part.type === 'container') visit(part.components);
			if (part.type === 'section') visit(part.components);
		}
	};
	visit(reply.components);
	return all;
}

/**
 * Every button in `reply` the Player can press to come back to the Game.
 */
function buttonsIn(reply: Reply): Button[] {
	return allParts(reply)
		.flatMap((part) => (part.type === 'actionRow' ? part.components : []))
		.filter((button): button is Button => button.type === 'button');
}

/**
 * Every text in `reply`, in order.
 */
function textsIn(reply: Reply): string[] {
	return allParts(reply).flatMap((part) => (part.type === 'textDisplay' ? [part.content] : []));
}

/**
 * Each of `reply`'s buttons by label, and whether it can be pressed.
 */
function buttonStates(reply: Reply): { disabled: boolean; label: string }[] {
	return buttonsIn(reply).map(({ disabled, label }) => ({ disabled: disabled ?? false, label }));
}

/**
 * A Game with in-memory storage and the given Quests.
 */
function newGame(quests: Quest[] = QUESTS): Game {
	return createGame({ quests, storage: openStorage(':memory:') });
}

test('/quest start says Quests are coming soon when there are none', () => {
	const game = newGame([]);

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply, { components: [{ content: 'Quests are coming soon.', type: 'textDisplay' }] });
});

test('/quest start shows the first Quest on its own, with buttons to choose it or move through the rest', () => {
	const game = newGame();

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.components.slice(0, 2), [
		{ content: 'Choose a Quest.', type: 'textDisplay' },
		{
			components: [
				{ content: '## The Amber Road\nA pilgrimage along the old trade road.', type: 'textDisplay' },
				{ type: 'separator' },
				{ content: '-# Quest 1 of 2', type: 'textDisplay' },
			],
			type: 'container',
		},
	]);
	assert.equal(reply.components[2]?.type, 'actionRow');
	assert.deepEqual(buttonStates(reply), [
		{ disabled: false, label: 'Previous' },
		{ disabled: false, label: 'Choose this Quest' },
		{ disabled: false, label: 'Next' },
	]);
});

/**
 * Presses the button labeled `label` in `reply`, and returns what the Player sees next.
 */
function press(game: Game, reply: Reply, label: string): Reply {
	const button = buttonsIn(reply).find((button) => button.label === label);
	assert.ok(button, `no button labeled ${label}`);
	assert.ok(!button.disabled, `${label} is disabled`);
	return game.handle('player-1', 'server-1', { button: button.id }, NOW).reply;
}

test('Next shows the next Quest, with its image, and Previous goes back', () => {
	const game = newGame();
	const { reply: first } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	const second = press(game, first, 'Next');

	assert.deepEqual(second.components[1], {
		components: [
			{ items: [{ media: image('clockwork-tower/tower.png') }], type: 'mediaGallery' },
			{ content: '## The Clockwork Tower\nClimb a tower of gears before it strikes midnight.', type: 'textDisplay' },
			{ type: 'separator' },
			{ content: '-# Quest 2 of 2', type: 'textDisplay' },
		],
		type: 'container',
	});
	assert.deepEqual(buttonStates(second), [
		{ disabled: false, label: 'Previous' },
		{ disabled: false, label: 'Choose this Quest' },
		{ disabled: false, label: 'Next' },
	]);
	assert.deepEqual(press(game, second, 'Previous'), first);
});

test('Previous on the first Quest wraps around to the last, and Next on the last wraps back to the first', () => {
	const game = newGame();
	const { reply: first } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	const last = press(game, first, 'Previous');

	assert.ok(textsIn(last).includes('-# Quest 2 of 2'));
	assert.deepEqual(press(game, last, 'Next'), first);
});

/**
 * Moves through `/quest start` to the Quest named `name`, chooses it, and returns what the Player sees.
 */
function chooseQuest(game: Game, name: string): Reply {
	let { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);
	while (!textsIn(reply).some((text) => text.startsWith(`## ${name}\n`))) reply = press(game, reply, 'Next');
	return press(game, reply, 'Choose this Quest');
}

test('choosing a Quest shows its first Character on its own, with their Stats, Traits, and Abilities', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Clockwork Tower');

	assert.deepEqual(reply.components.slice(0, 2), [
		{ content: 'Choose a Character for The Clockwork Tower.', type: 'textDisplay' },
		{
			components: [
				{ content: '## Iron Warden\nA guard who has never left her post.', type: 'textDisplay' },
				{ content: '**Stats**\nMax Health 14, Defense +4, Attack +3, Damage 2d4', type: 'textDisplay' },
				{
					content: '**Traits**\nStrength +3, Dexterity +0, Constitution +2, Intellect -1, Wisdom +0, Charisma +1',
					type: 'textDisplay',
				},
				{ content: '**Abilities**\n- Bulwark: Twice per Page: add +2 to a Defense roll.', type: 'textDisplay' },
				{ type: 'separator' },
				{ content: '-# Character 1 of 2 in The Clockwork Tower', type: 'textDisplay' },
			],
			type: 'container',
		},
	]);
	assert.deepEqual(buttonStates(reply), [
		{ disabled: false, label: 'Previous' },
		{ disabled: false, label: 'Choose this Character' },
		{ disabled: false, label: 'Next' },
	]);
});

test('Next shows the next Character, with their image, and Previous and Next wrap around', () => {
	const game = newGame();
	const first = chooseQuest(game, 'The Clockwork Tower');

	const second = press(game, first, 'Next');

	assert.deepEqual(second.components[1], {
		components: [
			{ items: [{ media: image('clockwork-tower/characters/tinker.PNG') }], type: 'mediaGallery' },
			{ content: '## Tinker\nBuilds what the tower breaks.', type: 'textDisplay' },
			{ content: '**Stats**\nMax Health 10, Defense +2, Attack +1, Damage d6', type: 'textDisplay' },
			{
				content: '**Traits**\nStrength -1, Dexterity +2, Constitution +0, Intellect +3, Wisdom +1, Charisma +0',
				type: 'textDisplay',
			},
			{
				content:
					'**Abilities**\n- Gadgeteer: Once per Rest: add d4 to an Intellect roll.\n- Spare Parts: Add +1 to rolls to repair.',
				type: 'textDisplay',
			},
			{ type: 'separator' },
			{ content: '-# Character 2 of 2 in The Clockwork Tower', type: 'textDisplay' },
		],
		type: 'container',
	});
	assert.deepEqual(press(game, second, 'Previous'), first);
	assert.deepEqual(press(game, second, 'Next'), first);
});

test('a Quest with one Character disables Previous and Next', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Amber Road');

	assert.deepEqual(buttonStates(reply), [
		{ disabled: true, label: 'Previous' },
		{ disabled: false, label: 'Choose this Character' },
		{ disabled: true, label: 'Next' },
	]);
});

test('a Character with no Abilities says so', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Amber Road');

	assert.ok(textsIn(reply).includes('**Abilities**\nnone'));
});

test('choosing a Character says starting a Quest is coming soon', () => {
	const game = newGame();

	const reply = press(game, chooseQuest(game, 'The Amber Road'), 'Choose this Character');

	assert.deepEqual(reply, { components: [{ content: 'Starting a Quest is coming soon.', type: 'textDisplay' }] });
});

/**
 * The fixture Quests, with The Clockwork Tower's Characters narrowed to those `keep` accepts.
 */
function questsWithTowerCharacters(keep: (name: string) => boolean): Quest[] {
	return QUESTS.map((quest) =>
		quest.id === 'clockwork-tower'
			? { ...quest, characters: quest.characters.filter((character) => keep(character.name)) }
			: quest,
	);
}

test('an old Choose this Character button still chooses the same Character after the Characters change', () => {
	const before = newGame();
	const tinker = press(before, chooseQuest(before, 'The Clockwork Tower'), 'Next');
	const choose = buttonsIn(tinker).find((button) => button.label === 'Choose this Character')?.id ?? '';

	const after = newGame(questsWithTowerCharacters((name) => name === 'Tinker'));
	const gone = newGame(questsWithTowerCharacters((name) => name !== 'Tinker'));

	assert.deepEqual(after.handle('player-1', 'server-1', { button: choose }, NOW).reply, {
		components: [{ content: 'Starting a Quest is coming soon.', type: 'textDisplay' }],
	});
	assert.throws(() => gone.handle('player-1', 'server-1', { button: choose }, NOW), /Unknown button/);
});

test("every button id fits in Discord's 100 characters when Quest and Character ids are as long as they can be", () => {
	const quest = QUESTS.find((quest) => quest.id === 'clockwork-tower')!;
	const long = {
		...quest,
		characters: quest.characters.map((character, i) => ({ ...character, id: `${i}`.repeat(MAX_ID_LENGTH) })),
		id: 'q'.repeat(MAX_ID_LENGTH),
	};
	const game = newGame([long]);

	const quests = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW).reply;
	const characters = press(game, quests, 'Choose this Quest');

	const ids = [...buttonsIn(quests), ...buttonsIn(characters)].map((button) => button.id);
	assert.equal(ids.length, 6);
	for (const id of ids) assert.ok(id.length <= 100, `${id} is ${id.length} characters`);
});

test('a button for a Quest or Character that does not exist is an error', () => {
	const game = newGame();

	for (const button of [
		'next:quests:2',
		'next:characters:amber-road:1',
		'next:characters:nowhere:0',
		'character:amber-road:nobody',
		'next:quests:',
		'quest:amber-road:extra',
	]) {
		assert.throws(() => game.handle('player-1', 'server-1', { button }, NOW), new RegExp(`Unknown button: ${button}`));
	}
});

test('a button for a Quest that does not exist is an error', () => {
	const game = newGame();

	assert.throws(
		() => game.handle('player-1', 'server-1', { button: 'quest:nowhere' }, NOW),
		/Unknown button: quest:nowhere/,
	);
});
