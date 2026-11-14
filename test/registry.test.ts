import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtempDisposable, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Character, QuestMetadata } from '../src/builder.ts';
import { loadQuests } from '../src/registry.ts';

/**
 * The builder API, as the Quest files written by {@link load} import it.
 */
const BUILDER = pathToFileURL(fileURLToPath(new URL('../src/builder.ts', import.meta.url))).href;

/**
 * Valid Quest metadata, for a test to change one field of.
 */
const METADATA: QuestMetadata = {
	complete: false,
	currency: 'gold',
	id: 'amber-road',
	name: 'The Amber Road',
	ruleModules: [],
};

/**
 * A valid Character, for a test to change one field of.
 */
const CHARACTER: Character = {
	abilities: [{ name: 'Devout', text: 'Add +1 to Wisdom rolls.' }],
	id: 'pilgrim',
	name: 'Pilgrim',
	stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
	traits: { strength: 0, dexterity: 0, constitution: 1, intellect: 0, wisdom: 2, charisma: 1 },
};

/**
 * Writes each Quest as a directory, quest-1/ and on, with its `quest.ts` and a characters/character-1.ts and on,
 * then loads them all, as startup does.
 */
async function load(quests: { characters?: unknown[]; metadata?: unknown }[]): Promise<unknown> {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	for (const [q, { characters = [CHARACTER], metadata = METADATA }] of quests.entries()) {
		const questDir = join(dir.path, `quest-${q + 1}`);
		await mkdir(join(questDir, 'characters'), { recursive: true });
		await writeFile(join(questDir, 'quest.ts'), source('quest', metadata));
		for (const [c, character] of characters.entries()) {
			await writeFile(join(questDir, 'characters', `character-${c + 1}.ts`), source('character', character));
		}
	}
	return await loadQuests(dir.path);
}

/**
 * A Quest file that exports `value` through the builder helper `helper`.
 */
function source(helper: 'character' | 'quest', value: unknown): string {
	return `import { ${helper} } from '${BUILDER}';\n\nexport default ${helper}(${JSON.stringify(value)});\n`;
}

test('Quests load, skipping files that are not Quest directories or Character files', async () => {
	await assert.doesNotReject(loadQuests(fileURLToPath(new URL('fixtures/quests/', import.meta.url))));
});

test('a Quest that turns on an unknown Rule Module fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, ruleModules: ['minions'] } }]),
		/quest-1\/quest\.ts: ruleModules has an unknown Rule Module: minions/,
	);
});

test('two Quests with the same id fail to load', async () => {
	await assert.rejects(
		load([{}, { metadata: { ...METADATA, name: 'The Amber Road Again' } }]),
		/quest-2\/quest\.ts: id amber-road is already used by .*quest-1\/quest\.ts/,
	);
});

test('two Characters in one Quest with the same id fail to load', async () => {
	await assert.rejects(
		load([{ characters: [CHARACTER, { ...CHARACTER, name: 'Pilgrim Again' }] }]),
		/characters\/character-2\.ts: id pilgrim is already used by .*characters\/character-1\.ts/,
	);
});

test('Characters in different Quests can share an id', async () => {
	await assert.doesNotReject(load([{}, { metadata: { ...METADATA, id: 'amber-road-again' } }]));
});

test('a Character whose Damage is not a die fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'lots' } }] }]),
		/characters\/character-1\.ts: stats\.damage must be dice, such as d6 or 2d4, not lots/,
	);
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'a d6 and a d4' } }] }]),
		/characters\/character-1\.ts: stats\.damage must be dice, such as d6 or 2d4, not a d6 and a d4/,
	);
});

test('a Quest with no Characters fails to load', async () => {
	await assert.rejects(load([{ characters: [] }]), /quest-1\/characters: has no Characters/);
});

test('a Quest that names a meter without turning on the meter Rule Module fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, meter: 'Virtue' } }]),
		/quest-1\/quest\.ts: meter is named, but ruleModules doesn't turn on meter/,
	);
});

test('a Quest that turns on the meter Rule Module without naming the meter fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, ruleModules: ['meter'] } }]),
		/quest-1\/quest\.ts: ruleModules turns on meter, but meter has no name/,
	);
});

test('a Quest whose id is not lowercase letters, digits, and hyphens fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, id: 'Amber Road' } }]),
		/quest-1\/quest\.ts: id must be lowercase letters, digits, and hyphens, not Amber Road/,
	);
});

test('a Character whose Trait is not a whole number fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, traits: { ...CHARACTER.traits, wisdom: 1.5 } }] }]),
		/characters\/character-1\.ts: traits\.wisdom must be a whole number, not 1\.5/,
	);
});

test('a Character whose Attack or Defense is not a whole number fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, attack: 0.5 } }] }]),
		/characters\/character-1\.ts: stats\.attack must be a whole number, not 0\.5/,
	);
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, defense: 0.5 } }] }]),
		/characters\/character-1\.ts: stats\.defense must be a whole number, not 0\.5/,
	);
});

test('a Character whose Max Health is not a whole number of at least 1 fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 0 } }] }]),
		/characters\/character-1\.ts: stats\.maxHealth must be a whole number of at least 1, not 0/,
	);
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 7.5 } }] }]),
		/characters\/character-1\.ts: stats\.maxHealth must be a whole number of at least 1, not 7\.5/,
	);
});

test('a Character with 1 Max Health loads', async () => {
	await assert.doesNotReject(load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 1 } }] }]));
});

test('a Quest directory without a quest.ts fails to load, naming the file', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1', 'characters'), { recursive: true });

	await assert.rejects(loadQuests(dir.path), /quest-1\/quest\.ts: Cannot find module/);
});

test('a Character whose id is not lowercase letters, digits, and hyphens fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, id: 'pilgrim one' }] }]),
		/characters\/character-1\.ts: id must be lowercase letters, digits, and hyphens, not pilgrim one/,
	);
});
