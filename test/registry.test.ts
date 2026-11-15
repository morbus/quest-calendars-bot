import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtempDisposable, rm, symlink, truncate, writeFile } from 'node:fs/promises';
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
	reputation: 'Piety',
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

test('each loaded Quest and Character remembers the file that declared it', async () => {
	const fixtures = fileURLToPath(new URL('fixtures/quests/', import.meta.url));

	// The Amber Road, in pilgrimage/, sorts first.
	const [pilgrimage] = await loadQuests([fixtures]);

	assert.equal(pilgrimage?.file, join(fixtures, 'pilgrimage', 'quest.ts'));
	assert.equal(pilgrimage?.characters[0]?.file, join(fixtures, 'pilgrimage', 'characters', 'pilgrim.ts'));
});

test('a Quest that turns on an unknown Rule Module fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, ruleModules: ['meter'] } }]),
		/quest-1\/quest\.ts: ruleModules has an unknown Rule Module: meter/,
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

test('a Quest whose id is not letters a–z and digits 0–9 with single hyphens fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, id: 'Amber Road' } }]),
		/quest-1\/quest\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not "Amber Road"/,
	);
});

test('a Quest whose id has a hyphen at its start or end, or two in a row, fails to load', async () => {
	for (const id of ['amber-', '-amber', 'amber--road']) {
		await assert.rejects(
			load([{ metadata: { ...METADATA, id } }]),
			new RegExp(`id must be letters a–z and digits 0–9, with single hyphens between them, not "${id}"`),
		);
	}
});

test('a Quest whose id has a letter outside a–z fails to load', async () => {
	await assert.rejects(
		load([{ metadata: { ...METADATA, id: 'café' } }]),
		/id must be letters a–z and digits 0–9, with single hyphens between them, not "café"/,
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

test('a Character whose id is not letters a–z and digits 0–9 with single hyphens fails to load', async () => {
	await assert.rejects(
		load([{ characters: [{ ...CHARACTER, id: 'pilgrim one' }] }]),
		/characters\/character-1\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not "pilgrim one"/,
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
		error: /quest\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not undefined/,
	},
	{
		name: 'a Quest id over 44 characters',
		quest: { metadata: { ...METADATA, id: 'a'.repeat(45) } },
		error: /quest\.ts: id must be at most 44 characters/,
	},
	{
		name: 'a Quest with no name',
		quest: { metadata: { ...METADATA, name: undefined } },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not undefined/,
	},
	{
		name: 'a Quest with an empty name',
		quest: { metadata: { ...METADATA, name: '' } },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not ""/,
	},
	{
		name: 'a Quest name over 80 characters',
		quest: { metadata: { ...METADATA, name: 'A'.repeat(81) } },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not "A{81}"/,
	},
	{
		name: 'a completion flag that is not true or false',
		quest: { metadata: { ...METADATA, complete: 'yes' } },
		error: /quest\.ts: complete must be true or false, not "yes"/,
	},
	{
		name: 'a Quest with no Currency',
		quest: { metadata: { ...METADATA, currency: undefined } },
		error: /quest\.ts: currency must be text that isn't blank, not undefined/,
	},
	{
		name: 'Rule Modules that are not a list',
		quest: { metadata: { ...METADATA, ruleModules: 'minions' } },
		error: /quest\.ts: ruleModules must be a list, not "minions"/,
	},
	{
		name: 'a Quest with no Reputation',
		quest: { metadata: { ...METADATA, reputation: undefined } },
		error: /quest\.ts: reputation must be text that isn't blank, not undefined/,
	},
	{
		name: 'an empty Reputation name',
		quest: { metadata: { ...METADATA, reputation: '' } },
		error: /quest\.ts: reputation must be text that isn't blank, not ""/,
	},
	{
		name: 'a Character that is not an object',
		quest: { characters: [null] },
		error: /character-1\.ts: the default export must be an object, not null/,
	},
	{
		name: 'a Character id that is not text',
		quest: { characters: [{ ...CHARACTER, id: 5 }] },
		error: /character-1\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not 5/,
	},
	{
		name: 'a Character with no name',
		quest: { characters: [{ ...CHARACTER, name: undefined }] },
		error: /character-1\.ts: name must be text of 1 to 80 characters that isn't blank, not undefined/,
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
		error: /character-1\.ts: abilities\[0\]\.name must be text that isn't blank, not undefined/,
	},
	{
		name: 'an Ability with no text',
		quest: { characters: [{ ...CHARACTER, abilities: [{ name: 'Devout' }] }] },
		error: /character-1\.ts: abilities\[0\]\.text must be text that isn't blank, not undefined/,
	},
	{
		name: 'a Quest with no description',
		quest: { metadata: { ...METADATA, description: undefined } },
		error: /quest\.ts: description must be text that isn't blank, not undefined/,
	},
	{
		name: 'a Character with no description',
		quest: { characters: [{ ...CHARACTER, description: ' ' }] },
		error: /character-1\.ts: description must be text that isn't blank, not " "/,
	},
	{
		name: 'a Quest image that is not an image file',
		quest: { metadata: { ...METADATA, image: 'notes.txt' } },
		error: /quest\.ts: image must be a \.gif, \.jpeg, \.jpg, \.png, or \.webp file, not "notes\.txt"/,
	},
	{
		name: 'a Quest image that is not text',
		quest: { metadata: { ...METADATA, image: 5 } },
		error: /quest\.ts: image must be a \.gif, \.jpeg, \.jpg, \.png, or \.webp file, not 5/,
	},
	{
		name: 'a Quest image at an absolute path',
		quest: { metadata: { ...METADATA, image: '/srv/art/map.png' } },
		error:
			/quest\.ts: image must be a path relative to this file, inside its Quest's directory, not "\/srv\/art\/map\.png"/,
	},
	{
		name: "a Character image outside its Quest's directory",
		quest: { characters: [{ ...CHARACTER, image: '../../shared/map.png' }] },
		error:
			/character-1\.ts: image must be a path relative to this file, inside its Quest's directory, not "\.\.\/\.\.\/shared\/map\.png"/,
	},
	{
		name: 'a Character image that does not exist',
		quest: { characters: [{ ...CHARACTER, image: 'missing.png' }] },
		error: /character-1\.ts: image must be a file at that path, relative to this one, not "missing\.png"/,
	},
	{
		name: 'a Rule Module turned on twice',
		quest: { metadata: { ...METADATA, ruleModules: ['minions', 'minions'] } },
		error: /quest\.ts: ruleModules turns on minions more than once/,
	},
	{
		name: 'a Quest name of only spaces',
		quest: { metadata: { ...METADATA, name: '   ' } },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not "   "/,
	},
	{
		name: 'a Quest name across two lines',
		quest: { metadata: { ...METADATA, name: 'The Amber\nRoad' } },
		error: /quest\.ts: name must be one line, not "The Amber\\nRoad"/,
	},
	{
		name: 'an Ability text of only spaces',
		quest: { characters: [{ ...CHARACTER, abilities: [{ name: 'Devout', text: ' ' }] }] },
		error: /character-1\.ts: abilities\[0\]\.text must be text that isn't blank, not " "/,
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
	await symlink(fileURLToPath(new URL('fixtures/quests/pilgrimage', import.meta.url)), join(dir.path, 'pilgrimage'));

	const quests = await loadQuests([dir.path]);

	assert.deepEqual(
		quests.map((quest) => quest.name),
		['The Amber Road'],
	);
});

test('no Quests in any QUESTS_DIR directory fails to load', async () => {
	await using first = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await using second = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(first.path, '.git'));

	await assert.rejects(
		loadQuests([first.path, second.path]),
		new RegExp(`${first.path}:${second.path}: has no Quests`),
	);
});

test('names of 80 characters and ids of 44 load', async () => {
	await assert.doesNotReject(
		load([
			{
				characters: [{ ...CHARACTER, id: 'p'.repeat(44), name: 'P'.repeat(80) }],
				metadata: { ...METADATA, id: 'a'.repeat(44), name: 'A'.repeat(80) },
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

test('more than 25 Quests load, since /quest start shows them one at a time', async () => {
	await assert.doesNotReject(load(questsNumbered(26)));
});

/**
 * Writes a Quest into `dir` whose image, map.png, is `bytes` bytes.
 */
async function writeQuestWithImage(dir: string, bytes: number): Promise<void> {
	await mkdir(join(dir, 'quest-1', 'characters'), { recursive: true });
	await writeFile(join(dir, 'quest-1', 'quest.ts'), source('quest', { ...METADATA, image: 'map.png' }));
	await writeFile(join(dir, 'quest-1', 'map.png'), Buffer.alloc(bytes));
	await writeFile(join(dir, 'quest-1', 'characters', 'pilgrim.ts'), source('character', CHARACTER));
}

/**
 * Writes one Quest whose image is `bytes` bytes, and loads it.
 */
async function loadWithImage(bytes: number): Promise<unknown> {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, bytes);
	return await loadQuests([dir.path]);
}

test('an image of 8 MiB loads', async () => {
	await assert.doesNotReject(loadWithImage(8 * 1024 * 1024));
});

test('an image over 8 MiB, more than Discord takes in a message, fails to load', async () => {
	await assert.rejects(loadWithImage(8 * 1024 * 1024 + 1), /quest\.ts: image must be at most 8 MiB, not "map\.png"/);
});

test("an absolute image path fails to load, even to a file in the Quest's own directory", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 1);
	const image = join(dir.path, 'quest-1', 'map.png');
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', { ...METADATA, image }));

	await assert.rejects(
		loadQuests([dir.path]),
		/quest\.ts: image must be a path relative to this file, inside its Quest's directory/,
	);
});

test("an image linked to a file outside its Quest's directory fails to load", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 1);
	await writeFile(join(dir.path, 'shared.png'), Buffer.alloc(1));
	await symlink(join(dir.path, 'shared.png'), join(dir.path, 'quest-1', 'linked.png'));
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', { ...METADATA, image: 'linked.png' }));

	await assert.rejects(
		loadQuests([dir.path]),
		/quest\.ts: image must be a file inside its Quest's directory, without a symbolic link leading out, not "linked\.png"/,
	);
});

test("an image linked to another file in its Quest's directory loads, under the link's name", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 1);
	await writeFile(join(dir.path, 'quest-1', 'map.png'), 'map bytes');
	await symlink('map.png', join(dir.path, 'quest-1', 'linked.png'));
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source('quest', { ...METADATA, image: 'linked.png' }));

	const [quest] = await loadQuests([dir.path]);

	assert.deepEqual(quest?.image, { data: Buffer.from('map bytes'), name: 'linked.png' });
});

test("a Character image elsewhere in its Quest's directory loads", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 1);
	const characterFile = join(dir.path, 'quest-1', 'characters', 'pilgrim.ts');
	// A name that starts with two dots is still inside the Quest's directory.
	await writeFile(join(dir.path, 'quest-1', '..map.png'), Buffer.alloc(2));
	await writeFile(characterFile, source('character', { ...CHARACTER, image: '../..map.png' }));

	const [quest] = await loadQuests([dir.path]);

	assert.deepEqual(quest?.characters[0]?.image, { data: Buffer.alloc(2), name: '..map.png' });
});

test('an image too large to read, such as one over 2 GiB, fails to load with the 8 MiB rule', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 0);
	// A sparse file, so the test writes no 3 GiB to disk.
	await truncate(join(dir.path, 'quest-1', 'map.png'), 3 * 1024 * 1024 * 1024);

	await assert.rejects(loadQuests([dir.path]), /quest\.ts: image must be at most 8 MiB, not "map\.png"/);
});

test('an image moved after startup still shows, since it was read at startup', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuestWithImage(dir.path, 16);
	const [quest] = await loadQuests([dir.path]);

	await rm(join(dir.path, 'quest-1', 'map.png'));

	assert.deepEqual(quest?.image, { data: Buffer.alloc(16), name: 'map.png' });
});
