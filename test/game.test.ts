import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempDisposable } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Button, Component } from '../src/components.ts';
import { createGame, everyScreen, gameDay, type Game, type Reply } from '../src/game.ts';
import { loadQuests, MAX_ID_LENGTH, type Image, type LoadedQuest } from '../src/registry.ts';
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
		.flatMap((part) => {
			if (part.type === 'actionRow') return part.components;
			if (part.type === 'section') return [part.accessory];
			return [];
		})
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
function newGame(quests: LoadedQuest[] = QUESTS): Game {
	return createGame({ quests, storage: openStorage(':memory:'), timezone: 'America/New_York' });
}

test('/quest start shows the first Quest on its own, with buttons to choose it or move through the rest', () => {
	const game = newGame();

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.components.slice(0, 1), [
		{
			components: [
				{ content: '## The Amber Road\nA pilgrimage along the old trade road.', type: 'textDisplay' },
				{ type: 'separator' },
				{ content: '-# Quest 1 of 2', type: 'textDisplay' },
			],
			type: 'container',
		},
	]);
	assert.equal(reply.components[1]?.type, 'actionRow');
	assert.equal(reply.components.length, 2);
	assert.deepEqual(buttonStates(reply), [
		{ disabled: false, label: 'Previous' },
		{ disabled: false, label: 'Choose this Quest' },
		{ disabled: false, label: 'Next' },
	]);
});

/**
 * Presses the button labeled `label` in `reply`, from the server `serverId`, and returns what the Player sees next.
 */
function press(game: Game, reply: Reply, label: string, serverId: string | null = 'server-1'): Reply {
	const button = buttonsIn(reply).find((button) => button.label === label);
	assert.ok(button, `no button labeled ${label}`);
	assert.ok(!button.disabled, `${label} is disabled`);
	return game.handle('player-1', serverId, { button: button.id }, NOW).reply;
}

test('Next shows the next Quest, with its image, and Previous goes back', () => {
	const game = newGame();
	const { reply: first } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	const second = press(game, first, 'Next');

	assert.deepEqual(second.components[0], {
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

	assert.ok(textsIn(last).some((text) => text.startsWith('## The Clockwork Tower\n')));
	assert.ok(textsIn(last).includes('-# Quest 2 of 2'));
	assert.deepEqual(press(game, last, 'Next'), first);
});

/**
 * Moves through `/quest start`, from the server `serverId`, to the Quest named `name`,
 * chooses it, and returns what the Player sees.
 */
function chooseQuest(game: Game, name: string, serverId: string | null = 'server-1'): Reply {
	let { reply } = game.handle('player-1', serverId, { command: 'quest start' }, NOW);
	while (!textsIn(reply).some((text) => text.startsWith(`## ${name}\n`))) reply = press(game, reply, 'Next', serverId);
	return press(game, reply, 'Choose this Quest', serverId);
}

test('choosing a Quest shows its first Character on its own, with their Stats, Traits, and Abilities', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Clockwork Tower');

	assert.deepEqual(reply.components.slice(0, 1), [
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

	assert.deepEqual(second.components[0], {
		components: [
			{ items: [{ media: image('clockwork-tower/tinker.PNG') }], type: 'mediaGallery' },
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

test('a Quest with one Character shows only the button to choose them, with no Previous or Next', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Amber Road');

	assert.deepEqual(buttonStates(reply), [{ disabled: false, label: 'Choose this Character' }]);
});

test('only one Quest shows only the button to choose it, with no Previous or Next', () => {
	const game = newGame(QUESTS.filter((quest) => quest.name === 'The Amber Road'));

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(buttonStates(reply), [{ disabled: false, label: 'Choose this Quest' }]);
});

test('a Character with no Abilities says so', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Amber Road');

	assert.ok(textsIn(reply).includes('**Abilities**\nnone'));
});

test('choosing a Character starts the Quest with one Page in the Backlog, showing their image and a Sheet of their starting Stats, Traits, and Abilities', () => {
	const game = newGame();

	const tinker = press(game, chooseQuest(game, 'The Clockwork Tower'), 'Next');

	const reply = press(game, tinker, 'Choose this Character');

	assert.deepEqual(reply, {
		components: [
			{
				components: [
					{ items: [{ media: image('clockwork-tower/tinker.PNG') }], type: 'mediaGallery' },
					{
						content: '## The Clockwork Tower\nYou start as Tinker. Your first Page is ready.',
						type: 'textDisplay',
					},
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
					{ content: '-# Use `/quest play` to play it.', type: 'textDisplay' },
				],
				type: 'container',
			},
		],
	});
});

/**
 * What starting The Amber Road shows when the Player is already playing it.
 */
const ALREADY_PLAYING: Reply = {
	components: [
		{
			content:
				"You're already playing The Amber Road. Use `/quest play` to play your next Page, or `/quest abandon` to wipe it and start again.",
			type: 'textDisplay',
		},
	],
};

test('choosing a Character in a Quest the Player is already playing is refused', () => {
	const game = newGame();
	const characters = chooseQuest(game, 'The Amber Road');
	press(game, characters, 'Choose this Character');

	const again = press(game, characters, 'Choose this Character');

	assert.deepEqual(again, ALREADY_PLAYING);
});

test('choosing a Quest the Player is already playing is refused before they pick a Character', () => {
	const game = newGame();
	press(game, chooseQuest(game, 'The Amber Road'), 'Choose this Character');

	const again = chooseQuest(game, 'The Amber Road');

	assert.deepEqual(again, ALREADY_PLAYING);
});

test('another Player can start a Quest someone else is already playing', () => {
	const game = newGame();
	press(game, chooseQuest(game, 'The Amber Road'), 'Choose this Character');
	const { reply: quests } = game.handle('player-2', 'server-1', { command: 'quest start' }, NOW);
	const characters = game.handle('player-2', 'server-1', { button: buttonsIn(quests)[1]!.id }, NOW).reply;

	const { reply } = game.handle('player-2', 'server-1', { button: buttonsIn(characters)[0]!.id }, NOW);

	assert.equal(textsIn(reply)[0], '## The Amber Road\nYou start as Pilgrim. Your first Page is ready.');
});

test('moving through the Characters of a Quest the Player is already playing is refused', () => {
	const game = newGame();
	const characters = chooseQuest(game, 'The Clockwork Tower');
	press(game, characters, 'Choose this Character');

	const next = press(game, characters, 'Next');

	assert.deepEqual(textsIn(next), [
		"You're already playing The Clockwork Tower. Use `/quest play` to play your next Page, or `/quest abandon` to wipe it and start again.",
	]);
});

test('a Quest started in one server is already being played in another server and outside any server', () => {
	const game = newGame();
	press(game, chooseQuest(game, 'The Amber Road', 'server-1'), 'Choose this Character', 'server-1');

	assert.deepEqual(chooseQuest(game, 'The Amber Road', 'server-2'), ALREADY_PLAYING);
	assert.deepEqual(chooseQuest(game, 'The Amber Road', null), ALREADY_PLAYING);
});

test('a Player playing one Quest can start another', () => {
	const game = newGame();
	press(game, chooseQuest(game, 'The Amber Road'), 'Choose this Character');

	const reply = press(game, chooseQuest(game, 'The Clockwork Tower'), 'Choose this Character');

	assert.equal(textsIn(reply)[0], '## The Clockwork Tower\nYou start as Iron Warden. Your first Page is ready.');
});

test('a Quest started before the bot restarts is still being played after it', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	const before = createGame({ quests: QUESTS, storage: openStorage(path), timezone: 'America/New_York' });
	press(before, chooseQuest(before, 'The Amber Road'), 'Choose this Character');

	const after = createGame({ quests: QUESTS, storage: openStorage(path), timezone: 'America/New_York' });

	assert.deepEqual(chooseQuest(after, 'The Amber Road'), ALREADY_PLAYING);
});

/**
 * The fixture Quests, with The Clockwork Tower's Characters narrowed to those `keep` accepts.
 */
function questsWithTowerCharacters(keep: (name: string) => boolean): LoadedQuest[] {
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

	assert.equal(
		textsIn(after.handle('player-1', 'server-1', { button: choose }, NOW).reply)[0],
		'## The Clockwork Tower\nYou start as Tinker. Your first Page is ready.',
	);
	assert.throws(() => gone.handle('player-1', 'server-1', { button: choose }, NOW), /Unknown button/);
});

test("every button id fits in Discord's 100 characters when Quest and Character ids are as long as they can be", () => {
	const quest = QUESTS.find((quest) => quest.id === 'clockwork-tower')!;
	const long = {
		...quest,
		characters: quest.characters.map((character, i) => ({ ...character, id: `${i}`.repeat(MAX_ID_LENGTH) })),
		id: 'q'.repeat(MAX_ID_LENGTH),
	};
	// A second Quest, so the first shows Previous and Next too.
	const game = newGame([long, QUESTS.find((quest) => quest.id === 'amber-road')!]);

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

test('every screen of every Quest and Character is listed with where it is declared, as Players see it', () => {
	const game = newGame();
	const fixtures = fileURLToPath(new URL('fixtures/quests/', import.meta.url));

	const screens = everyScreen(QUESTS);

	assert.deepEqual(
		screens.map(({ source }) => relative(fixtures, source)),
		[
			'pilgrimage/quest.ts',
			'pilgrimage/quest.ts: characters[0] (pilgrim)',
			'pilgrimage/quest.ts: characters[0] (pilgrim), once started',
			'clockwork-tower/quest.ts',
			'clockwork-tower/quest.ts: characters[0] (warden)',
			'clockwork-tower/quest.ts: characters[0] (warden), once started',
			'clockwork-tower/quest.ts: characters[1] (tinker)',
			'clockwork-tower/quest.ts: characters[1] (tinker), once started',
		],
	);
	const { reply: amberRoad } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);
	assert.deepEqual(screens[0]?.reply, amberRoad);
	assert.deepEqual(screens[3]?.reply, press(game, amberRoad, 'Next'));
	assert.deepEqual(screens[6]?.reply, press(game, chooseQuest(game, 'The Clockwork Tower'), 'Next'));
});

test("a Character's screen once started is listed as it shows whenever they start", () => {
	const game = newGame();
	const tinker = press(game, chooseQuest(game, 'The Clockwork Tower'), 'Next');

	const started = press(game, tinker, 'Choose this Character');

	assert.deepEqual(everyScreen(QUESTS)[7]?.reply, started);
});

test("a Game Day rolls over at midnight in the game's timezone, not at midnight UTC", () => {
	// 10:30 PM on November 20 in New York.
	const lateEvening = new Date('2026-11-21T03:30:00Z');

	assert.equal(gameDay(lateEvening, 'America/New_York'), '2026-11-20');
	assert.equal(gameDay(lateEvening, 'UTC'), '2026-11-21');
});
