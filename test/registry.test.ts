import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadQuests } from '../src/registry.ts';

/**
 * The path of a fixture directory in test/fixtures/.
 */
function fixture(path: string): string {
	return fileURLToPath(new URL(`fixtures/${path}`, import.meta.url));
}

test('Quests load, skipping files that are not Quest directories or Character files', async () => {
	await assert.doesNotReject(loadQuests(fixture('quests/')));
});
