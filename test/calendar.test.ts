import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameDay } from '../src/calendar.ts';

test("a Game Day rolls over at midnight in the game's timezone, not at midnight UTC", () => {
	// 10:30 PM on November 20 in New York.
	const lateEvening = new Date('2026-11-21T03:30:00Z');

	assert.equal(gameDay(lateEvening, 'America/New_York'), '2026-11-20');
	assert.equal(gameDay(lateEvening, 'UTC'), '2026-11-21');
});
