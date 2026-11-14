/**
 * The Quest registry: loads every Quest directory at startup and rejects invalid content.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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
 * An image, read when the bot starts.
 */
export type Image = {
	/**
	 * The image file's bytes.
	 */
	data: Buffer;
	/**
	 * The image file's name, such as "tower.png".
	 */
	name: string;
};

/**
 * The most bytes of images Discord takes in one message, and so the largest image.
 */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Quest metadata or a Character as loaded, with its image read in place of the authored path.
 */
export type Loaded<T extends { image?: string }> = Omit<T, 'image'> & {
	/**
	 * The image to show with it, if any.
	 */
	image?: Image;
};

/**
 * A loaded Quest: its metadata and its Characters.
 */
export type Quest = Loaded<QuestMetadata> & {
	/**
	 * The Quest's Characters, sorted by name.
	 */
	characters: Loaded<Character>[];
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
		const metadata = await loadFile(metadataFile, (value) => checkMetadata(value, metadataFile, questDir));
		claim(claims, metadata, metadataFile);
		const characters: Loaded<Character>[] = [];
		const characterClaims = newClaims();
		const characterFiles = await readdir(join(questDir, 'characters')).catch((error) => {
			if (error.code === 'ENOENT') return [];
			throw error;
		});
		for (const name of characterFiles) {
			if (name.startsWith('.') || !name.endsWith('.ts')) continue;
			const file = join(questDir, 'characters', name);
			const character = await loadFile(file, (value) => checkCharacter(value, file, questDir));
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
async function loadFile<T>(file: string, check: (value: unknown) => T): Promise<T> {
	try {
		return check((await import(pathToFileURL(file).href)).default);
	} catch (error) {
		throw new Error(`${file}: ${error instanceof Error ? error.message : error}`, { cause: error });
	}
}

/**
 * Accepts valid Quest metadata from `file`, in `questDir`, with its image read.
 *
 * @throws When it isn't.
 */
function checkMetadata(value: unknown, file: string, questDir: string): Loaded<QuestMetadata> {
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
	return withImage(metadata, file, questDir);
}

/**
 * Accepts a valid Character from `file`, in `questDir`, with its image read.
 *
 * @throws When it isn't.
 */
function checkCharacter(value: unknown, file: string, questDir: string): Loaded<Character> {
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
	return withImage(character, file, questDir);
}

/**
 * `declared`, with its image, if any, read from its path relative to `file`, which must stay in `questDir`.
 *
 * @remarks
 * Reading it now means a reply still shows it if the file moves while the bot runs.
 *
 * @throws When the image isn't an image file, is outside `questDir`, doesn't exist, or is too large for Discord.
 */
function withImage<T extends { image?: string }>(declared: T, file: string, questDir: string): Loaded<T> {
	const { image, ...rest } = declared;
	if (image === undefined) return rest;
	if (typeof image !== 'string' || !IMAGE_EXTENSIONS.includes(extname(image).toLowerCase())) {
		fail('image', `a ${IMAGE_EXTENSIONS.slice(0, -1).join(', ')}, or ${IMAGE_EXTENSIONS.at(-1)} file`, image);
	}
	const path = resolve(dirname(file), image);
	// A Quest is self-contained: its images stay in its directory, wherever that directory is.
	const insideRule = "a path relative to this file, inside its Quest's directory";
	if (isAbsolute(image) || isOutside(questDir, path)) fail('image', insideRule, image);
	const stats = statSync(path, { throwIfNoEntry: false });
	if (!stats?.isFile()) fail('image', 'a file at that path, relative to this one', image);
	// A symbolic link inside the Quest can still lead out of it.
	if (isOutside(realpathSync(questDir), realpathSync(path))) fail('image', insideRule, image);
	const maxSizeRule = `at most ${MAX_IMAGE_BYTES / 1024 / 1024} MiB`;
	// Check the size before reading, so a huge file isn't read at all,
	// and again after, in case the file was still being written.
	if (stats.size > MAX_IMAGE_BYTES) fail('image', maxSizeRule, image);
	const data = readFileSync(path);
	if (data.length > MAX_IMAGE_BYTES) fail('image', maxSizeRule, image);
	return { ...rest, image: { data, name: basename(path) } };
}

/**
 * Whether `path` is outside the directory `dir`.
 */
function isOutside(dir: string, path: string): boolean {
	return relative(dir, path).split(sep)[0] === '..';
}

/**
 * Accepts a Quest or Character id.
 *
 * @throws When it isn't letters a–z and digits 0–9 with single hyphens between them, or is too long.
 */
function checkId(id: unknown): void {
	if (typeof id !== 'string' || !ID.test(id)) {
		fail('id', 'letters a–z and digits 0–9, with single hyphens between them', id);
	}
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
	if (!ok)
		fail(field, `text${maxLength === undefined ? '' : ` of 1 to ${maxLength} characters`} that isn't blank`, value);
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
