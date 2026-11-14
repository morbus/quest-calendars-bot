/**
 * The Quest registry: loads every Quest directory at startup and rejects invalid content.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { RULE_MODULES, TRAITS, type Character, type QuestMetadata } from './builder.ts';

/**
 * A Quest or Character id, such as "clockwork-tower".
 */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The longest id, which keeps the button ids made from it within Discord's 100 characters.
 */
const MAX_ID_LENGTH = 64;

/**
 * The longest Quest or Character name, which is Discord's limit for a button label.
 */
const MAX_NAME_LENGTH = 80;

/**
 * Dice to roll, such as "d6" or "2d4".
 */
const DICE = /^([1-9]\d*)?d[1-9]\d*$/;

/**
 * A loaded Quest: its metadata and its Characters.
 */
export type Quest = QuestMetadata & {
	/**
	 * The Quest's Characters, sorted by name.
	 */
	characters: Character[];
};

/**
 * Loads every Quest directory in each of `dirs`, sorted by name.
 *
 * @throws When a Quest is invalid, naming the file at fault and the problem.
 */
export async function loadQuests(dirs: string[]): Promise<Quest[]> {
	const quests: Quest[] = [];
	const questIds = new Map<string, string>();
	const questNames = new Map<string, string>();
	for (const dir of dirs) {
		quests.push(...(await loadQuestDirs(dir, questIds, questNames)));
	}
	return quests.sort(byName);
}

/**
 * Loads every Quest directory in `dir`, claiming each Quest's id and name.
 *
 * @throws When a Quest is invalid, naming the file at fault and the problem.
 */
async function loadQuestDirs(
	dir: string,
	questIds: Map<string, string>,
	questNames: Map<string, string>,
): Promise<Quest[]> {
	const quests: Quest[] = [];
	for (const entry of await readdir(dir)) {
		const questDir = join(dir, entry);
		// stat() follows a symbolic link, so a linked Quest directory loads too.
		if (entry.startsWith('.') || !(await stat(questDir)).isDirectory()) continue;
		const metadataFile = join(questDir, 'quest.ts');
		const metadata = await loadFile(metadataFile, checkMetadata);
		claim(questIds, 'id', metadata.id, metadataFile);
		claim(questNames, 'name', metadata.name, metadataFile);
		const characters: Character[] = [];
		const characterIds = new Map<string, string>();
		const characterNames = new Map<string, string>();
		const characterFiles = await readdir(join(questDir, 'characters')).catch((error) => {
			if (error.code === 'ENOENT') return [];
			throw error;
		});
		for (const name of characterFiles) {
			if (name.startsWith('.') || !name.endsWith('.ts')) continue;
			const file = join(questDir, 'characters', name);
			const character = await loadFile(file, checkCharacter);
			claim(characterIds, 'id', character.id, file);
			claim(characterNames, 'name', character.name, file);
			characters.push(character);
		}
		if (characters.length === 0) throw new Error(`${join(questDir, 'characters')}: has no Characters`);
		quests.push({ ...metadata, characters: characters.sort(byName) });
	}
	return quests;
}

/**
 * Orders Quests or Characters by name.
 */
function byName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name);
}

/**
 * Records that `file` declares `value` as its `field`, such as its id.
 *
 * @throws When an earlier file in `claimed` declared the same value.
 */
function claim(claimed: Map<string, string>, field: 'id' | 'name', value: string, file: string): void {
	const earlier = claimed.get(value);
	if (earlier) throw new Error(`${file}: ${field} ${value} is already used by ${earlier}`);
	claimed.set(value, file);
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
	checkObject('the default export', value);
	const metadata = value as QuestMetadata;
	checkId(metadata.id);
	checkName(metadata.name);
	if (typeof metadata.complete !== 'boolean') fail('complete', 'true or false', metadata.complete);
	checkText('currency', metadata.currency);
	if (!Array.isArray(metadata.ruleModules)) fail('ruleModules', 'a list', metadata.ruleModules);
	for (const [i, ruleModule] of metadata.ruleModules.entries()) {
		if (!RULE_MODULES.includes(ruleModule)) throw new Error(`ruleModules has an unknown Rule Module: ${ruleModule}`);
		if (metadata.ruleModules.indexOf(ruleModule) !== i) {
			throw new Error(`ruleModules turns on ${ruleModule} more than once`);
		}
	}
	const hasMeter = metadata.ruleModules.includes('meter');
	if (metadata.meter !== undefined) {
		if (!hasMeter) throw new Error("meter is named, but ruleModules doesn't turn on meter");
		checkText('meter', metadata.meter);
	}
	if (hasMeter && metadata.meter === undefined) throw new Error('ruleModules turns on meter, but meter has no name');
	return metadata;
}

/**
 * Accepts a valid Character.
 *
 * @throws When it isn't.
 */
function checkCharacter(value: unknown): Character {
	checkObject('the default export', value);
	const character = value as Character;
	checkId(character.id);
	checkName(character.name);
	checkObject('stats', character.stats);
	const { attack, damage, defense, maxHealth } = character.stats;
	if (typeof damage !== 'string' || !DICE.test(damage)) fail('stats.damage', 'dice, such as d6 or 2d4', damage);
	if (!Number.isInteger(maxHealth) || maxHealth < 1) fail('stats.maxHealth', 'a whole number of at least 1', maxHealth);
	checkWholeNumber('stats.attack', attack);
	checkWholeNumber('stats.defense', defense);
	checkObject('traits', character.traits);
	for (const trait of TRAITS) checkWholeNumber(`traits.${trait}`, character.traits[trait]);
	if (!Array.isArray(character.abilities)) fail('abilities', 'a list', character.abilities);
	for (const [i, ability] of character.abilities.entries()) {
		checkObject(`abilities[${i}]`, ability);
		checkText(`abilities[${i}].name`, ability.name);
		checkText(`abilities[${i}].text`, ability.text);
	}
	return character;
}

/**
 * Accepts a Quest or Character id.
 *
 * @throws When it isn't lowercase letters, digits, and hyphens, or is too long.
 */
function checkId(id: unknown): void {
	if (typeof id !== 'string' || !ID.test(id)) fail('id', 'lowercase letters, digits, and hyphens', id);
	if (id.length > MAX_ID_LENGTH) fail('id', `at most ${MAX_ID_LENGTH} characters`, id);
}

/**
 * Accepts a Quest or Character name, which Players see on a button.
 *
 * @throws When it isn't one line of text of at most {@link MAX_NAME_LENGTH} characters.
 */
function checkName(name: unknown): void {
	checkText('name', name, MAX_NAME_LENGTH);
	if (/[\r\n]/.test(name as string)) fail('name', 'one line', name);
}

/**
 * Accepts text that isn't blank, of at most `maxLength` characters if given.
 *
 * @throws When `value`, at `field`, isn't.
 */
function checkText(field: string, value: unknown, maxLength?: number): void {
	const ok = typeof value === 'string' && value.trim().length > 0 && value.length <= (maxLength ?? value.length);
	if (!ok) fail(field, maxLength === undefined ? 'text' : `text of 1 to ${maxLength} characters`, value);
}

/**
 * Accepts a whole number, such as a modifier.
 *
 * @throws When `value`, at `field`, isn't one.
 */
function checkWholeNumber(field: string, value: unknown): void {
	if (!Number.isInteger(value)) fail(field, 'a whole number', value);
}

/**
 * Accepts an object, such as the Stats.
 *
 * @throws When `value`, at `field`, isn't one.
 */
function checkObject(field: string, value: unknown): void {
	if (typeof value !== 'object' || value === null) fail(field, 'an object', value);
}

/**
 * Rejects `value`, at `field`, for not being what was `expected`.
 */
function fail(field: string, expected: string, value: unknown): never {
	// JSON shows NaN and Infinity as null, so numbers are shown as they are.
	const shown = typeof value === 'number' ? String(value) : JSON.stringify(value);
	throw new Error(`${field} must be ${expected}, not ${shown}`);
}
