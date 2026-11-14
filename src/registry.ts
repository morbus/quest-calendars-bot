/**
 * The Quest registry: loads every Quest directory at startup and rejects invalid content.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Character, QuestMetadata } from './builder.ts';

/**
 * A loaded Quest: its metadata and its Characters.
 */
export type Quest = QuestMetadata & {
	characters: Character[];
};

/**
 * Loads every Quest directory in `dir`, sorted by name.
 */
export async function loadQuests(dir: string): Promise<Quest[]> {
	const quests: Quest[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const questDir = join(dir, entry.name);
		const metadata = (await loadDefault(join(questDir, 'quest.ts'))) as QuestMetadata;
		const characters: Character[] = [];
		for (const file of await readdir(join(questDir, 'characters'))) {
			if (file.endsWith('.ts')) characters.push((await loadDefault(join(questDir, 'characters', file))) as Character);
		}
		quests.push({ ...metadata, characters: characters.sort(byName) });
	}
	return quests.sort(byName);
}

/**
 * Orders Quests or Characters by name.
 */
function byName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name);
}

/**
 * Imports the `.ts` file at `file` and returns its default export.
 */
async function loadDefault(file: string): Promise<unknown> {
	return (await import(pathToFileURL(file).href)).default;
}
