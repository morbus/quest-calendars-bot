import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createGame, type Game, type Reply } from '../src/game.ts';
import { loadQuests, type Quest } from '../src/registry.ts';
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
 * A Game with in-memory storage and the given Quests.
 */
function newGame(quests: Quest[] = QUESTS): Game {
	return createGame({ quests, storage: openStorage(':memory:') });
}

test('/quest start says Quests are coming soon when there are none', () => {
	const game = newGame([]);

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.sections, ['Quests are coming soon.']);
});

test('/quest start lists each Quest as a button, by name', () => {
	const game = newGame();

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.sections, ['Choose a Quest.']);
	assert.deepEqual(
		reply.buttons?.map((button) => button.label),
		['The Amber Road', 'The Clockwork Tower'],
	);
});

/**
 * Presses the `/quest start` button labeled `label`, and returns what the Player sees.
 */
function chooseQuest(game: Game, label: string): Reply {
	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);
	const button = reply.buttons?.find((button) => button.label === label);
	assert.ok(button, `no button labeled ${label}`);
	return game.handle('player-1', 'server-1', { button: button.id }, NOW).reply;
}

test('choosing a Quest lists its Characters, by name, with their Stats, Traits, and Abilities', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Clockwork Tower');

	assert.deepEqual(reply.sections, [
		'Characters in The Clockwork Tower:',
		[
			'Iron Warden',
			'Stats: Max Health 14, Defense +4, Attack +3, Damage 2d4',
			'Traits: Strength +3, Dexterity +0, Constitution +2, Intellect -1, Wisdom +0, Charisma +1',
			'Abilities:',
			'- Bulwark: Twice per Page: add +2 to a Defense roll.',
		].join('\n'),
		[
			'Tinker',
			'Stats: Max Health 10, Defense +2, Attack +1, Damage d6',
			'Traits: Strength -1, Dexterity +2, Constitution +0, Intellect +3, Wisdom +1, Charisma +0',
			'Abilities:',
			'- Gadgeteer: Once per Rest: add d4 to an Intellect roll.',
			'- Spare Parts: Add +1 to rolls to repair.',
		].join('\n'),
	]);
});

test('a Character with no Abilities says so', () => {
	const game = newGame();

	const reply = chooseQuest(game, 'The Amber Road');

	assert.deepEqual(reply.sections, [
		'Characters in The Amber Road:',
		[
			'Pilgrim',
			'Stats: Max Health 8, Defense +1, Attack +0, Damage d4',
			'Traits: Strength +0, Dexterity +0, Constitution +1, Intellect +0, Wisdom +2, Charisma +1',
			'Abilities: none',
		].join('\n'),
	]);
});

test('a button for a Quest that does not exist is an error', () => {
	const game = newGame();

	assert.throws(
		() => game.handle('player-1', 'server-1', { button: 'quest:nowhere' }, NOW),
		/Unknown button: quest:nowhere/,
	);
});
