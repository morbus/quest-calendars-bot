import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, type Dice, type Game } from '../src/game.ts';
import { openStorage } from '../src/storage.ts';

/**
 * The fixed time every test runs at, unless it moves the clock itself.
 */
const NOW = new Date('2026-11-13T09:00:00Z');

/**
 * Dice that return `rolls` in order, and fail the test when they run out.
 */
function scriptedDice(rolls: number[]): Dice {
	return {
		roll(sides) {
			const next = rolls.shift();
			assert.ok(next !== undefined, `rolled a d${sides} with no scripted rolls left`);
			return next;
		},
	};
}

/**
 * A Game with in-memory storage, scripted dice, and no Quests.
 */
function newGame({ rolls = [] }: { rolls?: number[] } = {}): Game {
	return createGame({ dice: scriptedDice(rolls), storage: openStorage(':memory:'), timezone: 'America/New_York' });
}

test('/quest start says no Quests are available', () => {
	const game = newGame();

	const { announcements, reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.sections, ['No Quests available']);
	assert.deepEqual(announcements, []);
});
