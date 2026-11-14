import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtempDisposable, symlink, writeFile } from 'node:fs/promises';
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
	description: 'A pilgrimage along the old trade road.',
	id: 'amber-road',
	name: 'The Amber Road',
	ruleModules: [],
};

/**
 * A valid Character, for a test to change one field of.
 */
const CHARACTER: Character = {
	abilities: [{ name: 'Devout', text: 'Add +1 to Wisdom rolls.' }],
	description: 'Walks the road for reasons of their own.',
	id: 'pilgrim',
	name: 'Pilgrim',
	stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
	traits: { strength: 0, dexterity: 0, constitution: 1, intellect: 0, wisdom: 2, charisma: 1 },
};

/**
 * A Quest to write for {@link load}: its metadata and Characters, each valid unless a test says otherwise.
 */
type QuestFiles = { characters?: unknown[]; metadata?: unknown };

/**
 * Writes each Quest as a directory, quest-1/ and on, with its `quest.ts` and a characters/character-1.ts and on,
 * then loads them all, as startup does.
 */
async function load(quests: QuestFiles[]): Promise<unknown> {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	for (const [q, { characters = [CHARACTER], metadata = METADATA }] of quests.entries()) {
		const questDir = join(dir.path, `quest-${q + 1}`);
		await mkdir(join(questDir, 'characters'), { recursive: true });
		await writeFile(join(questDir, 'quest.ts'), source('quest', metadata));
		for (const [c, character] of characters.entries()) {
			await writeFile(join(questDir, 'characters', `character-${c + 1}.ts`), source('character', character));
		}
	}
	return await loadQuests([dir.path]);
}

/**
 * A Quest file that exports `value` through the builder helper `helper`.
 */
function source(helper: 'character' | 'quest', value: unknown): string {
	return `import { ${helper} } from '${BUILDER}';\n\nexport default ${helper}(${JSON.stringify(value)});\n`;
}

test('Quests load, skipping files that are not Quest directories or Character files', async () => {
	await assert.doesNotReject(loadQuests([fileURLToPath(new URL('fixtures/quests/', import.meta.url))]));
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
	await assert.doesNotReject(
		load([{}, { metadata: { ...METADATA, id: 'amber-road-again', name: 'The Amber Road Again' } }]),
	);
});

test('a Character whose Damage is not a die fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'lots' } }] }]),
		/characters\/character-1\.ts: stats\.damage must be dice, such as d6 or 2d4, not "lots"/,
	);
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'a d6 and a d4' } }] }]),
		/characters\/character-1\.ts: stats\.damage must be dice, such as d6 or 2d4, not "a d6 and a d4"/,
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
		/quest-1\/quest\.ts: id must be lowercase letters, digits, and hyphens, not "Amber Road"/,
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

	await assert.rejects(loadQuests([dir.path]), /quest-1\/quest\.ts: Cannot find module/);
});

test('a Character whose id is not lowercase letters, digits, and hyphens fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, id: 'pilgrim one' }] }]),
		/characters\/character-1\.ts: id must be lowercase letters, digits, and hyphens, not "pilgrim one"/,
	);
});

/**
 * Quests that fail to load, each with the error that names what is wrong.
 */
const MALFORMED: { error: RegExp; name: string; quest: QuestFiles }[] = [
	{
		name: 'Quest metadata that is not an object',
		quest: { metadata: null },
		error: /quest\.ts: the default export must be an object, not null/,
	},
	{
		name: 'a Quest with no id',
		quest: { metadata: { ...METADATA, id: undefined } },
		error: /quest\.ts: id must be lowercase letters, digits, and hyphens, not undefined/,
	},
	{
		name: 'a Quest id over 64 characters',
		quest: { metadata: { ...METADATA, id: 'a'.repeat(65) } },
		error: /quest\.ts: id must be at most 64 characters/,
	},
	{
		name: 'a Quest with no name',
		quest: { metadata: { ...METADATA, name: undefined } },
		error: /quest\.ts: name must be text of 1 to 80 characters, not undefined/,
	},
	{
		name: 'a Quest with an empty name',
		quest: { metadata: { ...METADATA, name: '' } },
		error: /quest\.ts: name must be text of 1 to 80 characters, not ""/,
	},
	{
		name: 'a Quest name over 80 characters',
		quest: { metadata: { ...METADATA, name: 'A'.repeat(81) } },
		error: /quest\.ts: name must be text of 1 to 80 characters, not "A{81}"/,
	},
	{
		name: 'a completion flag that is not true or false',
		quest: { metadata: { ...METADATA, complete: 'yes' } },
		error: /quest\.ts: complete must be true or false, not "yes"/,
	},
	{
		name: 'a Quest with no Currency',
		quest: { metadata: { ...METADATA, currency: undefined } },
		error: /quest\.ts: currency must be text, not undefined/,
	},
	{
		name: 'Rule Modules that are not a list',
		quest: { metadata: { ...METADATA, ruleModules: 'meter' } },
		error: /quest\.ts: ruleModules must be a list, not "meter"/,
	},
	{
		name: 'an empty meter name',
		quest: { metadata: { ...METADATA, meter: '', ruleModules: ['meter'] } },
		error: /quest\.ts: meter must be text, not ""/,
	},
	{
		name: 'a Character that is not an object',
		quest: { characters: [null] },
		error: /character-1\.ts: the default export must be an object, not null/,
	},
	{
		name: 'a Character id that is not text',
		quest: { characters: [{ ...CHARACTER, id: 5 }] },
		error: /character-1\.ts: id must be lowercase letters, digits, and hyphens, not 5/,
	},
	{
		name: 'a Character with no name',
		quest: { characters: [{ ...CHARACTER, name: undefined }] },
		error: /character-1\.ts: name must be text of 1 to 80 characters, not undefined/,
	},
	{
		name: 'a Character with no Stats',
		quest: { characters: [{ ...CHARACTER, stats: undefined }] },
		error: /character-1\.ts: stats must be an object, not undefined/,
	},
	{
		name: 'a Damage that is not text',
		quest: { characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: ['d6'] } }] },
		error: /character-1\.ts: stats\.damage must be dice, such as d6 or 2d4, not \["d6"\]/,
	},
	{
		name: 'a Character with no Traits',
		quest: { characters: [{ ...CHARACTER, traits: undefined }] },
		error: /character-1\.ts: traits must be an object, not undefined/,
	},
	{
		name: 'a Character with no Abilities',
		quest: { characters: [{ ...CHARACTER, abilities: undefined }] },
		error: /character-1\.ts: abilities must be a list, not undefined/,
	},
	{
		name: 'an Ability that is not an object',
		quest: { characters: [{ ...CHARACTER, abilities: ['Devout'] }] },
		error: /character-1\.ts: abilities\[0\] must be an object, not "Devout"/,
	},
	{
		name: 'an Ability with no name',
		quest: { characters: [{ ...CHARACTER, abilities: [{ text: 'Add +1 to Wisdom rolls.' }] }] },
		error: /character-1\.ts: abilities\[0\]\.name must be text, not undefined/,
	},
	{
		name: 'an Ability with no text',
		quest: { characters: [{ ...CHARACTER, abilities: [{ name: 'Devout' }] }] },
		error: /character-1\.ts: abilities\[0\]\.text must be text, not undefined/,
	},
	{
		name: 'a Quest with no description',
		quest: { metadata: { ...METADATA, description: undefined } },
		error: /quest\.ts: description must be text, not undefined/,
	},
	{
		name: 'a Character with no description',
		quest: { characters: [{ ...CHARACTER, description: ' ' }] },
		error: /character-1\.ts: description must be text, not " "/,
	},
	{
		name: 'a Rule Module turned on twice',
		quest: { metadata: { ...METADATA, meter: 'Virtue', ruleModules: ['meter', 'meter'] } },
		error: /quest\.ts: ruleModules turns on meter more than once/,
	},
	{
		name: 'a Quest name of only spaces',
		quest: { metadata: { ...METADATA, name: '   ' } },
		error: /quest\.ts: name must be text of 1 to 80 characters, not "   "/,
	},
	{
		name: 'a Quest name across two lines',
		quest: { metadata: { ...METADATA, name: 'The Amber\nRoad' } },
		error: /quest\.ts: name must be one line, not "The Amber\\nRoad"/,
	},
	{
		name: 'an Ability text of only spaces',
		quest: { characters: [{ ...CHARACTER, abilities: [{ name: 'Devout', text: ' ' }] }] },
		error: /character-1\.ts: abilities\[0\]\.text must be text, not " "/,
	},
	{
		name: 'two Characters in one Quest with the same name',
		quest: { characters: [CHARACTER, { ...CHARACTER, id: 'pilgrim-again' }] },
		error: /character-2\.ts: name Pilgrim is already used by .*character-1\.ts/,
	},
];

for (const { error, name, quest } of MALFORMED) {
	test(`${name} fails to load`, async () => {
		await assert.rejects(load([quest]), error);
	});
}

test('a Quest directory without a characters directory fails to load', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1'));
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', METADATA));

	await assert.rejects(loadQuests([dir.path]), /quest-1\/characters: has no Characters/);
});

test('hidden directories, such as .git, are not Quests', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, '.git'));

	assert.deepEqual(await loadQuests([dir.path]), []);
});

test('names of 80 characters and ids of 64 load', async () => {
	await assert.doesNotReject(
		load([
			{
				characters: [{ ...CHARACTER, id: 'p'.repeat(64), name: 'P'.repeat(80) }],
				metadata: { ...METADATA, id: 'a'.repeat(64), name: 'A'.repeat(80) },
			},
		]),
	);
});

test('a characters that is a file, not a directory, fails to load', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1'));
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', METADATA));
	await writeFile(join(dir.path, 'quest-1', 'characters'), '');

	await assert.rejects(loadQuests([dir.path]), /ENOTDIR/);
});

test('two Quests with the same name fail to load', async () => {
	await assert.rejects(
		load([{}, { metadata: { ...METADATA, id: 'amber-road-again' } }]),
		/quest-2\/quest\.ts: name The Amber Road is already used by .*quest-1\/quest\.ts/,
	);
});

test('a number that is not a number is named as such', async () => {
	// JSON, which load() writes Quests with, has no NaN, so this Quest is written by hand.
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1', 'characters'), { recursive: true });
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', METADATA));
	const pilgrim = source('character', CHARACTER).replace('"maxHealth":8', '"maxHealth":NaN');
	await writeFile(join(dir.path, 'quest-1', 'characters', 'pilgrim.ts'), pilgrim);

	await assert.rejects(loadQuests([dir.path]), /stats\.maxHealth must be a whole number of at least 1, not NaN/);
});

test('hidden files in characters/, such as editor lock files, are not Characters', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1', 'characters'), { recursive: true });
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', METADATA));
	await writeFile(join(dir.path, 'quest-1', 'characters', 'pilgrim.ts'), source('character', CHARACTER));
	await writeFile(join(dir.path, 'quest-1', 'characters', '._pilgrim.ts'), 'not TypeScript');

	await assert.doesNotReject(loadQuests([dir.path]));
});

test('a Quest directory that is a symbolic link loads', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await symlink(fileURLToPath(new URL('fixtures/quests/pilgrimage', import.meta.url)), join(dir.path, 'pilgrimage'));

	const quests = (await loadQuests([dir.path])).map((quest) => quest.name);

	assert.deepEqual(quests, ['The Amber Road']);
});

test('Quests from every directory load, sorted together by name', async () => {
	await using extra = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await symlink(fileURLToPath(new URL('fixtures/quests/pilgrimage', import.meta.url)), join(extra.path, 'pilgrimage'));
	const clockwork = fileURLToPath(new URL('fixtures/quests/clockwork-tower', import.meta.url));
	await using first = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await symlink(clockwork, join(first.path, 'clockwork-tower'));

	const quests = (await loadQuests([first.path, extra.path])).map((quest) => quest.name);

	assert.deepEqual(quests, ['The Amber Road', 'The Clockwork Tower']);
});

test('two Quests with the same id in different directories fail to load', async () => {
	await using first = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await using second = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const pilgrimage = fileURLToPath(new URL('fixtures/quests/pilgrimage', import.meta.url));
	await symlink(pilgrimage, join(first.path, 'pilgrimage'));
	await symlink(pilgrimage, join(second.path, 'pilgrimage'));

	await assert.rejects(loadQuests([first.path, second.path]), /id amber-road is already used by/);
});

/**
 * `count` valid Quests, each with its own id and name.
 */
function questsNumbered(count: number): QuestFiles[] {
	return Array.from({ length: count }, (_, i) => ({
		metadata: { ...METADATA, id: `quest-${i + 1}`, name: `Quest ${i + 1}` },
	}));
}

test('25 Quests load, as many as /quest start can show as buttons', async () => {
	await assert.doesNotReject(load(questsNumbered(25)));
});

test('more than 25 Quests fail to load', async () => {
	await assert.rejects(load(questsNumbered(26)), /26 Quests are more than the 25 \/quest start can show/);
});
