/**
 * The Quest registry: loads every Quest directory at startup and rejects invalid content.
 */

import { statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
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
 * The most Quests, which is the most buttons Discord shows in one message.
 */
const MAX_QUESTS = 25;

/**
 * The image files Discord shows in a message.
 */
const IMAGE_EXTENSIONS = ['.gif', '.jpeg', '.jpg', '.png', '.webp'];

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
	const claims = newClaims();
	for (const dir of dirs) {
		quests.push(...(await loadQuestsIn(dir, claims)));
	}
	if (quests.length > MAX_QUESTS) {
		throw new Error(`${quests.length} Quests are more than the ${MAX_QUESTS} /quest start can show`);
	}
	return quests.sort(byName);
}

/**
 * Loads every Quest directory in `dir`, claiming each Quest's id and name in `claims`.
 *
 * @throws When a Quest is invalid, naming the file at fault and the problem.
 */
async function loadQuestsIn(dir: string, claims: Claims): Promise<Quest[]> {
	const quests: Quest[] = [];
	for (const entry of await readdir(dir)) {
		const questDir = join(dir, entry);
		// stat() follows a symbolic link, so a linked Quest directory loads too.
		if (entry.startsWith('.') || !(await stat(questDir)).isDirectory()) continue;
		const metadataFile = join(questDir, 'quest.ts');
		const metadata = await loadFile(metadataFile, checkMetadata);
		claim(claims, metadata, metadataFile);
		const characters: Character[] = [];
		const characterClaims = newClaims();
		const characterFiles = await readdir(join(questDir, 'characters')).catch((error) => {
			if (error.code === 'ENOENT') return [];
			throw error;
		});
		for (const name of characterFiles) {
			if (name.startsWith('.') || !name.endsWith('.ts')) continue;
			const file = join(questDir, 'characters', name);
			const character = await loadFile(file, checkCharacter);
			claim(characterClaims, character, file);
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
 * The ids and names of Quests, or of one Quest's Characters, each with the file that declared it.
 */
type Claims = {
	/**
	 * The file that declared each id.
	 */
	ids: Map<string, string>;
	/**
	 * The file that declared each name.
	 */
	names: Map<string, string>;
};

/**
 * {@link Claims} with nothing claimed yet.
 */
function newClaims(): Claims {
	return { ids: new Map(), names: new Map() };
}

/**
 * Records that `file` declares a Quest or Character with this `id` and `name`.
 *
 * @throws When an earlier file in `claims` declared the same id or name.
 */
function claim(claims: Claims, { id, name }: { id: string; name: string }, file: string): void {
	for (const [field, claimed, value] of [
		['id', claims.ids, id],
		['name', claims.names, name],
	] as const) {
		const earlier = claimed.get(value);
		if (earlier) throw new Error(`${file}: ${field} ${value} is already used by ${earlier}`);
		claimed.set(value, file);
	}
}

/**
 * Imports the `.ts` file at `file` and returns its default export, once `check` accepts it.
 *
 * @throws When the file can't be imported or `check` rejects it, naming the file.
 */
async function loadFile<T>(file: string, check: (value: unknown, file: string) => T): Promise<T> {
	try {
		return check((await import(pathToFileURL(file).href)).default, file);
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : error}`, { cause: error });
	}
}

/**
 * Accepts valid Quest metadata from `file`, with its image's full path.
 *
 * @throws When it isn't.
 */
function checkMetadata(value: unknown, file: string): QuestMetadata {
	checkObject('the default export', value);
	const metadata = value as QuestMetadata;
	checkId(metadata.id);
	checkName(metadata.name);
	checkText('description', metadata.description);
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
	return withImage(metadata, file);
}

/**
 * Accepts a valid Character from `file`, with its image's full path.
 *
 * @throws When it isn't.
 */
function checkCharacter(value: unknown, file: string): Character {
	checkObject('the default export', value);
	const character = value as Character;
	checkId(character.id);
	checkName(character.name);
	checkText('description', character.description);
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
	return withImage(character, file);
}

/**
 * `declared`, with its image, if any, as the full path of a file beside `file`.
 *
 * @throws When the image isn't an image file, or doesn't exist.
 */
function withImage<T extends { image?: string }>(declared: T, file: string): T {
	const { image } = declared;
	if (image === undefined) return declared;
	if (typeof image !== 'string' || !IMAGE_EXTENSIONS.includes(extname(image).toLowerCase())) {
		fail('image', `a ${IMAGE_EXTENSIONS.slice(0, -1).join(', ')}, or ${IMAGE_EXTENSIONS.at(-1)} file`, image);
	}
	const path = resolve(dirname(file), image);
	if (!statSync(path, { throwIfNoEntry: false })?.isFile()) fail('image', 'a file beside this one', image);
	return { ...declared, image: path };
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
