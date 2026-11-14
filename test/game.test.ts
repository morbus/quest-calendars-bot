import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGame, type Game, type Reply } from '../src/game.ts';
import { loadQuests, type Image, type Quest } from '../src/registry.ts';
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
 * Each of `reply`'s buttons by label, and whether it can be pressed.
 */
function buttonStates(reply: Reply): { disabled: boolean; label: string }[] | undefined {
	return reply.buttons?.map(({ disabled, label }) => ({ disabled: disabled ?? false, label }));
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

	assert.deepEqual(reply.sections, [{ text: 'Quests are coming soon.' }]);
});

test('/quest start shows the first Quest on its own, with buttons to choose it or move through the rest', () => {
	const game = newGame();

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.sections, [{ text: 'Choose a Quest.' }]);
	assert.deepEqual(reply.card, {
		description: 'A pilgrimage along the old trade road.',
		fields: [],
		footer: 'Quest 1 of 2',
		title: 'The Amber Road',
	});
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
	const button = reply.buttons?.find((button) => button.label === label);
	assert.ok(button, `no button labeled ${label}`);
	assert.ok(!button.disabled, `${label} is disabled`);
	return game.handle('player-1', 'server-1', { button: button.id }, NOW).reply;
}

test('Next shows the next Quest, with its image, and Previous goes back', () => {
	const game = newGame();
	const { reply: first } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	const second = press(game, first, 'Next');

	assert.deepEqual(second.card, {
		description: 'Climb a tower of gears before it strikes midnight.',
		fields: [],
		footer: 'Quest 2 of 2',
		image: image('clockwork-tower/tower.png'),
		title: 'The Clockwork Tower',
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

	assert.equal(last.card?.title, 'The Clockwork Tower');
	assert.deepEqual(press(game, last, 'Next'), first);
});

/**
 * Moves through `/quest start` to the Quest named `name`, chooses it, and returns what the Player sees.
 */
function chooseQuest(game: Game, name: string): Reply {
	let { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);
	while (reply.card?.title !== name) reply = press(game, reply, 'Next');
	return press(game, reply, 'Choose this Quest');
}

test('choosing a Quest shows its first Character on its own, with their Stats, Traits, and Abilities', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Clockwork Tower');

	assert.deepEqual(reply.sections, [{ text: 'Choose a Character for The Clockwork Tower.' }]);
	assert.deepEqual(reply.card, {
		description: 'A guard who has never left her post.',
		fields: [
			{ name: 'Stats', value: 'Max Health 14, Defense +4, Attack +3, Damage 2d4' },
			{
				name: 'Traits',
				value: 'Strength +3, Dexterity +0, Constitution +2, Intellect -1, Wisdom +0, Charisma +1',
			},
			{ name: 'Abilities', value: '- Bulwark: Twice per Page: add +2 to a Defense roll.' },
		],
		footer: 'Character 1 of 2 in The Clockwork Tower',
		title: 'Iron Warden',
	});
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

	assert.deepEqual(second.card, {
		description: 'Builds what the tower breaks.',
		fields: [
			{ name: 'Stats', value: 'Max Health 10, Defense +2, Attack +1, Damage d6' },
			{
				name: 'Traits',
				value: 'Strength -1, Dexterity +2, Constitution +0, Intellect +3, Wisdom +1, Charisma +0',
			},
			{
				name: 'Abilities',
				value: '- Gadgeteer: Once per Rest: add d4 to an Intellect roll.\n- Spare Parts: Add +1 to rolls to repair.',
			},
		],
		footer: 'Character 2 of 2 in The Clockwork Tower',
		image: image('clockwork-tower/characters/tinker.PNG'),
		title: 'Tinker',
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

	assert.deepEqual(reply.card?.fields.at(-1), { name: 'Abilities', value: 'none' });
});

test('choosing a Character says starting a Quest is coming soon', () => {
	const game = newGame();

	const reply = press(game, chooseQuest(game, 'The Amber Road'), 'Choose this Character');

	assert.deepEqual(reply, { sections: [{ text: 'Starting a Quest is coming soon.' }] });
});

/**
 * The fixture Quests, with The Clockwork Tower's Characters narrowed to those `keep` accepts.
 */
function towerKeeping(keep: (name: string) => boolean): Quest[] {
	return QUESTS.map((quest) =>
		quest.id === 'clockwork-tower'
			? { ...quest, characters: quest.characters.filter((character) => keep(character.name)) }
			: quest,
	);
}

test('an old Choose this Character button still chooses the same Character after the Characters change', () => {
	const before = newGame();
	const tinker = press(before, chooseQuest(before, 'The Clockwork Tower'), 'Next');
	const choose = tinker.buttons?.find((button) => button.label === 'Choose this Character')?.id ?? '';

	const after = newGame(towerKeeping((name) => name === 'Tinker'));
	const gone = newGame(towerKeeping((name) => name !== 'Tinker'));

	assert.deepEqual(after.handle('player-1', 'server-1', { button: choose }, NOW).reply, {
		sections: [{ text: 'Starting a Quest is coming soon.' }],
	});
	assert.throws(() => gone.handle('player-1', 'server-1', { button: choose }, NOW), /Unknown button/);
});

test("every button id fits in Discord's 100 characters when Quest and Character ids are as long as they can be", () => {
	const quest = QUESTS.find((quest) => quest.id === 'clockwork-tower')!;
	const long = {
		...quest,
		characters: quest.characters.map((character, i) => ({ ...character, id: `${i}`.repeat(44) })),
		id: 'q'.repeat(44),
	};
	const game = newGame([long]);

	const characters = press(
		game,
		game.handle('player-1', 'server-1', { command: 'quest start' }, NOW).reply,
		'Choose this Quest',
	);

	const ids = characters.buttons?.map((button) => button.id) ?? [];
	assert.equal(ids.length, 3);
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
