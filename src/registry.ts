/**
 * The Quest registry: loads every Quest directory at startup and rejects invalid content.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULE_MODULES, TRAITS, type Character, type QuestMetadata } from './builder.ts';

/**
 * A Quest or Character id, such as "clockwork-tower".
 */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Dice to roll, such as "d6" or "2d4".
 */
const DICE = /^([1-9]\d*)?d[1-9]\d*$/;

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
	const questIds = new Map<string, string>();
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const questDir = join(dir, entry.name);
		const metadataFile = join(questDir, 'quest.ts');
		const metadata = await loadFile(metadataFile, checkMetadata);
		claimId(questIds, metadata.id, metadataFile);
		const characters: Character[] = [];
		const characterIds = new Map<string, string>();
		for (const name of await readdir(join(questDir, 'characters'))) {
			if (!name.endsWith('.ts')) continue;
			const file = join(questDir, 'characters', name);
			const character = await loadFile(file, checkCharacter);
			claimId(characterIds, character.id, file);
			characters.push(character);
		}
		if (characters.length === 0) throw new Error(`${join(questDir, 'characters')}: has no Characters`);
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
 * Records that `file` declares `id`.
 *
 * @throws When `id` isn't lowercase letters, digits, and hyphens, or an earlier file in `ids` declared it.
 */
function claimId(ids: Map<string, string>, id: string, file: string): void {
	if (!ID.test(id)) throw new Error(`${file}: id must be lowercase letters, digits, and hyphens, not ${id}`);
	const earlier = ids.get(id);
	if (earlier) throw new Error(`${file}: id ${id} is already used by ${earlier}`);
	ids.set(id, file);
}

/**
 * Imports the `.ts` file at `file` and returns its default export, once `check` accepts it.
 *
 * @throws When the file can't be imported or `check` rejects it, naming the file.
 */
async function loadFile<T>(file: string, check: (value: unknown) => T): Promise<T> {
	try {
		return check((await import(pathToFileURL(file).href)).default);
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : error}`, { cause: error });
	}
}

/**
 * Accepts valid Quest metadata.
 *
 * @throws When it isn't.
 */
function checkMetadata(value: unknown): QuestMetadata {
	const metadata = value as QuestMetadata;
	for (const ruleModule of metadata.ruleModules) {
		if (!RULE_MODULES.includes(ruleModule)) throw new Error(`ruleModules has an unknown Rule Module: ${ruleModule}`);
	}
	const hasMeter = metadata.ruleModules.includes('meter');
	if (metadata.meter !== undefined && !hasMeter)
		throw new Error("meter is named, but ruleModules doesn't turn on meter");
	if (hasMeter && !metadata.meter) throw new Error('ruleModules turns on meter, but meter has no name');
	return metadata;
}

/**
 * Accepts a valid Character.
 *
 * @throws When it isn't.
 */
function checkCharacter(value: unknown): Character {
	const character = value as Character;
	if (!DICE.test(character.stats.damage)) {
		throw new Error(`stats.damage must be dice, such as d6 or 2d4, not ${character.stats.damage}`);
	}
	const { maxHealth } = character.stats;
	if (!Number.isInteger(maxHealth) || maxHealth < 1) {
		throw new Error(`stats.maxHealth must be a whole number of at least 1, not ${maxHealth}`);
	}
	checkWholeNumber('stats.attack', character.stats.attack);
	checkWholeNumber('stats.defense', character.stats.defense);
	for (const trait of TRAITS) checkWholeNumber(`traits.${trait}`, character.traits[trait]);
	return character;
}

/**
 * Accepts a whole number, such as a modifier.
 *
 * @throws When `value`, at `field`, isn't one.
 */
function checkWholeNumber(field: string, value: number): void {
	if (!Number.isInteger(value)) throw new Error(`${field} must be a whole number, not ${value}`);
}
