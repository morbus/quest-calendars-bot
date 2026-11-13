import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, type Game } from '../src/game.ts';
import { openStorage } from '../src/storage.ts';

/**
 * The fixed time every test runs at, unless it moves the clock itself.
 */
const NOW = new Date('2026-11-13T09:00:00Z');

/**
 * A Game with in-memory storage and no Quests.
 */
function newGame(): Game {
	return createGame({ storage: openStorage(':memory:') });
}

test('/quest start says no Quests are available', () => {
	const game = newGame();

	const { reply } = game.handle('player-1', 'server-1', { command: 'quest start' }, NOW);

	assert.deepEqual(reply.sections, ['No Quests available']);
});
