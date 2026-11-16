import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtempDisposable, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Character, Quest } from '../src/builder.ts';
import { loadQuests } from '../src/registry.ts';

/**
 * The builder API, as the Quest files written by {@link load} import it.
 */
const BUILDER = pathToFileURL(fileURLToPath(new URL('../src/builder.ts', import.meta.url))).href;

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
 * A valid Quest, with one Character, for a test to change one field of.
 */
const QUEST: Quest = {
	characters: [CHARACTER],
	complete: false,
	currency: 'gold',
	description: 'A pilgrimage along the old trade road.',
	id: 'amber-road',
	name: 'The Amber Road',
	reputation: 'Piety',
	ruleModules: [],
};

/**
 * Writes each Quest as a directory, quest-1/ and on, with its `quest.ts`, then loads them all, as startup does.
 */
async function load(quests: unknown[]): Promise<unknown> {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	for (const [q, quest] of quests.entries()) {
		await writeQuest(join(dir.path, `quest-${q + 1}`), quest);
	}
	return await loadQuests([dir.path]);
}

/**
 * Writes `quest` as the `quest.ts` in a new directory, `questDir`.
 */
async function writeQuest(questDir: string, quest: unknown): Promise<void> {
	await mkdir(questDir, { recursive: true });
	await writeFile(join(questDir, 'quest.ts'), source(quest));
}

/**
 * A `quest.ts` that exports `value` through the builder helper `quest`.
 */
function source(value: unknown): string {
	return `import { quest } from '${BUILDER}';\n\nexport default quest(${JSON.stringify(value)});\n`;
}

test('Quests load, skipping files that are not Quest directories', async () => {
	await assert.doesNotReject(loadQuests([fileURLToPath(new URL('fixtures/quests/', import.meta.url))]));
});

test('each loaded Quest remembers the file that declared it', async () => {
	const fixtures = fileURLToPath(new URL('fixtures/quests/', import.meta.url));

	// The Amber Road, in pilgrimage/, sorts first.
	const [pilgrimage] = await loadQuests([fixtures]);

	assert.equal(pilgrimage?.file, join(fixtures, 'pilgrimage', 'quest.ts'));
});

test('a Quest that turns on an unknown Rule Module fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, ruleModules: ['meter'] }]),
		/quest-1\/quest\.ts: ruleModules has an unknown Rule Module: meter/,
	);
});

test('two Quests with the same id fail to load', async () => {
	await assert.rejects(
		load([QUEST, { ...QUEST, name: 'The Amber Road Again' }]),
		/quest-2\/quest\.ts: id amber-road is already used by .*quest-1\/quest\.ts/,
	);
});

test('two Characters in one Quest with the same id fail to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [CHARACTER, { ...CHARACTER, name: 'Pilgrim Again' }] }]),
		/quest\.ts: characters\[1\] \(pilgrim\): id pilgrim is already used by characters\[0\] \(pilgrim\)/,
	);
});

test('Characters in different Quests can share an id', async () => {
	await assert.doesNotReject(load([QUEST, { ...QUEST, id: 'amber-road-again', name: 'The Amber Road Again' }]));
});

test('a Character whose Damage is not a die fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'lots' } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.damage must be dice, such as d6 or 2d4, not "lots"/,
	);
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: 'a d6 and a d4' } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.damage must be dice, such as d6 or 2d4, not "a d6 and a d4"/,
	);
});

test('a Quest with no Characters fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [] }]),
		/quest-1\/quest\.ts: characters must be a list of at least one Character, not \[\]/,
	);
	await assert.rejects(
		load([{ ...QUEST, characters: undefined }]),
		/quest-1\/quest\.ts: characters must be a list of at least one Character, not undefined/,
	);
});

test('Characters keep the order they are listed in, rather than sorting by name', async () => {
	const zed = { ...CHARACTER, id: 'zed', name: 'Zed' };
	const abe = { ...CHARACTER, id: 'abe', name: 'Abe' };

	const [quest] = (await load([{ ...QUEST, characters: [zed, abe] }])) as Awaited<ReturnType<typeof loadQuests>>;

	assert.deepEqual(
		quest?.characters.map((character) => character.name),
		['Zed', 'Abe'],
	);
});

test('a Quest whose id is not letters a–z and digits 0–9 with single hyphens fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, id: 'Amber Road' }]),
		/quest-1\/quest\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not "Amber Road"/,
	);
});

test('a Quest whose id has a hyphen at its start or end, or two in a row, fails to load', async () => {
	for (const id of ['amber-', '-amber', 'amber--road']) {
		await assert.rejects(
			load([{ ...QUEST, id }]),
			new RegExp(`id must be letters a–z and digits 0–9, with single hyphens between them, not "${id}"`),
		);
	}
});

test('a Quest whose id has a letter outside a–z fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, id: 'café' }]),
		/id must be letters a–z and digits 0–9, with single hyphens between them, not "café"/,
	);
});

test('a Character whose Trait is not a whole number fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, traits: { ...CHARACTER.traits, wisdom: 1.5 } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): traits\.wisdom must be a whole number, not 1\.5/,
	);
});

test('a Character whose Attack or Defense is not a whole number fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, attack: 0.5 } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.attack must be a whole number, not 0\.5/,
	);
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, defense: 0.5 } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.defense must be a whole number, not 0\.5/,
	);
});

test('a Character whose Max Health is not a whole number of at least 1 fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 0 } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.maxHealth must be a whole number of at least 1, not 0/,
	);
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 7.5 } }] }]),
		/quest\.ts: characters\[0\] \(pilgrim\): stats\.maxHealth must be a whole number of at least 1, not 7\.5/,
	);
});

test('a Character with 1 Max Health loads', async () => {
	await assert.doesNotReject(
		load([{ ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, maxHealth: 1 } }] }]),
	);
});

test('a Quest directory without a quest.ts fails to load, naming the file', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1'));

	await assert.rejects(loadQuests([dir.path]), /quest-1\/quest\.ts: Cannot find module/);
});

test('a Character whose id is not letters a–z and digits 0–9 with single hyphens fails to load', async () => {
	await assert.rejects(
		load([{ ...QUEST, characters: [{ ...CHARACTER, id: 'pilgrim one' }] }]),
		/quest\.ts: characters\[0\]: id must be letters a–z and digits 0–9, with single hyphens between them, not "pilgrim one"/,
	);
});

/**
 * Quests that fail to load, each with the error that names what is wrong.
 */
const MALFORMED: { error: RegExp; name: string; quest: unknown }[] = [
	{
		name: 'a Quest that is not an object',
		quest: null,
		error: /quest\.ts: the default export must be an object, not null/,
	},
	{
		name: 'a Quest with no id',
		quest: { ...QUEST, id: undefined },
		error: /quest\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not undefined/,
	},
	{
		name: 'a Quest id over 44 characters',
		quest: { ...QUEST, id: 'a'.repeat(45) },
		error: /quest\.ts: id must be at most 44 characters/,
	},
	{
		name: 'a Quest with no name',
		quest: { ...QUEST, name: undefined },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not undefined/,
	},
	{
		name: 'a Quest with an empty name',
		quest: { ...QUEST, name: '' },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not ""/,
	},
	{
		name: 'a Quest name over 80 characters',
		quest: { ...QUEST, name: 'A'.repeat(81) },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not "A{81}"/,
	},
	{
		name: 'a completion flag that is not true or false',
		quest: { ...QUEST, complete: 'yes' },
		error: /quest\.ts: complete must be true or false, not "yes"/,
	},
	{
		name: 'a Quest with no Currency',
		quest: { ...QUEST, currency: undefined },
		error: /quest\.ts: currency must be text that isn't blank, not undefined/,
	},
	{
		name: 'Rule Modules that are not a list',
		quest: { ...QUEST, ruleModules: 'minions' },
		error: /quest\.ts: ruleModules must be a list, not "minions"/,
	},
	{
		name: 'a Quest with no Reputation',
		quest: { ...QUEST, reputation: undefined },
		error: /quest\.ts: reputation must be text that isn't blank, not undefined/,
	},
	{
		name: 'an empty Reputation name',
		quest: { ...QUEST, reputation: '' },
		error: /quest\.ts: reputation must be text that isn't blank, not ""/,
	},
	{
		name: 'a Character that is not an object',
		quest: { ...QUEST, characters: [null] },
		error: /quest\.ts: characters\[0\] must be an object, not null/,
	},
	{
		name: 'a Character id that is not text',
		quest: { ...QUEST, characters: [{ ...CHARACTER, id: 5 }] },
		error: /quest\.ts: characters\[0\]: id must be letters a–z and digits 0–9, with single hyphens between them, not 5/,
	},
	{
		name: 'a Character id over 44 characters, which is not named as the Character',
		quest: { ...QUEST, characters: [{ ...CHARACTER, id: 'p'.repeat(45) }] },
		error: /quest\.ts: characters\[0\]: id must be at most 44 characters/,
	},
	{
		name: 'a Character with no name',
		quest: { ...QUEST, characters: [{ ...CHARACTER, name: undefined }] },
		error:
			/quest\.ts: characters\[0\] \(pilgrim\): name must be text of 1 to 80 characters that isn't blank, not undefined/,
	},
	{
		name: 'a Character with no Stats',
		quest: { ...QUEST, characters: [{ ...CHARACTER, stats: undefined }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): stats must be an object, not undefined/,
	},
	{
		name: 'a Damage that is not text',
		quest: { ...QUEST, characters: [{ ...CHARACTER, stats: { ...CHARACTER.stats, damage: ['d6'] } }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): stats\.damage must be dice, such as d6 or 2d4, not \["d6"\]/,
	},
	{
		name: 'a Character with no Traits',
		quest: { ...QUEST, characters: [{ ...CHARACTER, traits: undefined }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): traits must be an object, not undefined/,
	},
	{
		name: 'a Character with no Abilities',
		quest: { ...QUEST, characters: [{ ...CHARACTER, abilities: undefined }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): abilities must be a list, not undefined/,
	},
	{
		name: 'an Ability that is not an object',
		quest: { ...QUEST, characters: [{ ...CHARACTER, abilities: ['Devout'] }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): abilities\[0\] must be an object, not "Devout"/,
	},
	{
		name: 'an Ability with no name',
		quest: { ...QUEST, characters: [{ ...CHARACTER, abilities: [{ text: 'Add +1 to Wisdom rolls.' }] }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): abilities\[0\]\.name must be text that isn't blank, not undefined/,
	},
	{
		name: 'an Ability with no text',
		quest: { ...QUEST, characters: [{ ...CHARACTER, abilities: [{ name: 'Devout' }] }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): abilities\[0\]\.text must be text that isn't blank, not undefined/,
	},
	{
		name: 'a Quest with no description',
		quest: { ...QUEST, description: undefined },
		error: /quest\.ts: description must be text that isn't blank, not undefined/,
	},
	{
		name: 'a Character with no description',
		quest: { ...QUEST, characters: [{ ...CHARACTER, description: ' ' }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): description must be text that isn't blank, not " "/,
	},
	{
		name: 'a Quest image that is not an image file',
		quest: { ...QUEST, image: 'notes.txt' },
		error: /quest\.ts: image must be a \.gif, \.jpeg, \.jpg, \.png, or \.webp file, not "notes\.txt"/,
	},
	{
		name: 'a Quest image that is not text',
		quest: { ...QUEST, image: 5 },
		error: /quest\.ts: image must be a \.gif, \.jpeg, \.jpg, \.png, or \.webp file, not 5/,
	},
	{
		name: 'a Quest image at an absolute path',
		quest: { ...QUEST, image: '/srv/art/map.png' },
		error:
			/quest\.ts: image must be a path relative to this file, inside its Quest's directory, not "\/srv\/art\/map\.png"/,
	},
	{
		name: "a Character image outside its Quest's directory",
		quest: { ...QUEST, characters: [{ ...CHARACTER, image: '../shared/map.png' }] },
		error:
			/quest\.ts: characters\[0\] \(pilgrim\): image must be a path relative to this file, inside its Quest's directory, not "\.\.\/shared\/map\.png"/,
	},
	{
		name: 'a Character image that does not exist',
		quest: { ...QUEST, characters: [{ ...CHARACTER, image: 'missing.png' }] },
		error:
			/quest\.ts: characters\[0\] \(pilgrim\): image must be a file at that path, relative to this one, not "missing\.png"/,
	},
	{
		name: 'a Rule Module turned on twice',
		quest: { ...QUEST, ruleModules: ['minions', 'minions'] },
		error: /quest\.ts: ruleModules turns on minions more than once/,
	},
	{
		name: 'a Quest name of only spaces',
		quest: { ...QUEST, name: '   ' },
		error: /quest\.ts: name must be text of 1 to 80 characters that isn't blank, not "   "/,
	},
	{
		name: 'a Quest name across two lines',
		quest: { ...QUEST, name: 'The Amber\nRoad' },
		error: /quest\.ts: name must be one line, not "The Amber\\nRoad"/,
	},
	{
		name: 'an Ability text of only spaces',
		quest: { ...QUEST, characters: [{ ...CHARACTER, abilities: [{ name: 'Devout', text: ' ' }] }] },
		error: /quest\.ts: characters\[0\] \(pilgrim\): abilities\[0\]\.text must be text that isn't blank, not " "/,
	},
	{
		name: 'two Characters in one Quest with the same name',
		quest: { ...QUEST, characters: [CHARACTER, { ...CHARACTER, id: 'pilgrim-again' }] },
		error: /quest\.ts: characters\[1\] \(pilgrim-again\): name Pilgrim is already used by characters\[0\] \(pilgrim\)/,
	},
];

for (const { error, name, quest } of MALFORMED) {
	test(`${name} fails to load`, async () => {
		await assert.rejects(load([quest]), error);
	});
}

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
				...QUEST,
				characters: [{ ...CHARACTER, id: 'p'.repeat(44), name: 'P'.repeat(80) }],
				id: 'a'.repeat(44),
				name: 'A'.repeat(80),
			},
		]),
	);
});

test('two Quests with the same name fail to load', async () => {
	await assert.rejects(
		load([QUEST, { ...QUEST, id: 'amber-road-again' }]),
		/quest-2\/quest\.ts: name The Amber Road is already used by .*quest-1\/quest\.ts/,
	);
});

test('a number that is not a number is named as such', async () => {
	// JSON, which load() writes Quests with, has no NaN, so this Quest is written by hand.
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(dir.path, 'quest-1'));
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source(QUEST).replace('"maxHealth":8', '"maxHealth":NaN'));

	await assert.rejects(loadQuests([dir.path]), /stats\.maxHealth must be a whole number of at least 1, not NaN/);
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
function questsNumbered(count: number): Quest[] {
	return Array.from({ length: count }, (_, i) => ({ ...QUEST, id: `quest-${i + 1}`, name: `Quest ${i + 1}` }));
}

test('more than 25 Quests load, since /quest start shows them one at a time', async () => {
	await assert.doesNotReject(load(questsNumbered(26)));
});

/**
 * Writes a Quest into `dir` whose image, map.png, is `bytes` bytes.
 */
async function writeQuestWithImage(dir: string, bytes: number): Promise<void> {
	await writeQuest(join(dir, 'quest-1'), { ...QUEST, image: 'map.png' });
	await writeFile(join(dir, 'quest-1', 'map.png'), Buffer.alloc(bytes));
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
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source({ ...QUEST, image }));

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
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source({ ...QUEST, image: 'linked.png' }));

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
	await writeFile(join(dir.path, 'quest-1', 'quest.ts'), source({ ...QUEST, image: 'linked.png' }));

	const [quest] = await loadQuests([dir.path]);

	assert.deepEqual(quest?.image, { data: Buffer.from('map bytes'), name: 'linked.png' });
});

test("a Character image's path is relative to its Quest's directory", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuest(join(dir.path, 'quest-1'), {
		...QUEST,
		characters: [{ ...CHARACTER, image: 'portraits/pilgrim.png' }],
	});
	await mkdir(join(dir.path, 'quest-1', 'portraits'));
	await writeFile(join(dir.path, 'quest-1', 'portraits', 'pilgrim.png'), Buffer.alloc(2));

	const [quest] = await loadQuests([dir.path]);

	assert.deepEqual(quest?.characters[0]?.image, { data: Buffer.alloc(2), name: 'pilgrim.png' });
});

test("an image whose name starts with two dots is still inside its Quest's directory", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await writeQuest(join(dir.path, 'quest-1'), { ...QUEST, characters: [{ ...CHARACTER, image: '..map.png' }] });
	await writeFile(join(dir.path, 'quest-1', '..map.png'), Buffer.alloc(2));

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
