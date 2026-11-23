import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtempDisposable, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage, type PlayerQuest } from '../src/storage.ts';

test('a file in a folder that does not exist cannot be opened', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'missing', 'game.sqlite');

	assert.throws(() => openStorage(path), /unable to open database file/);
});

test('a file that is not a SQLite database cannot be opened', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'notes.txt');
	await writeFile(path, 'This is not a database.');

	assert.throws(() => openStorage(path), /file is not a database/);
});

// Root can write to a read-only file, so this can only be checked as another user.
test('a database that cannot be written to cannot be opened', { skip: process.getuid?.() === 0 }, async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'read-only.sqlite');
	new DatabaseSync(path).close();
	await chmod(path, 0o444);

	assert.throws(() => openStorage(path), /attempt to write a readonly database/);
});

test('a database this version of the bot made can be opened again', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	openStorage(path);

	assert.doesNotThrow(() => openStorage(path));
});

test('a database from a newer version of the bot cannot be opened', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	const newer = new DatabaseSync(path);
	newer.exec('PRAGMA user_version = 999');
	newer.close();

	assert.throws(() => openStorage(path), /Game state is newer than expected \(999 > /);
});

test('a new database can be opened and used', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const storage = openStorage(join(dir.path, 'game.sqlite'));

	assert.equal(
		storage.transaction(() => 'done'),
		'done',
	);
});

test('a migration that fails partway leaves the database as it was, so it can be tried again', async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	const old = new DatabaseSync(path);
	old.exec('CREATE TABLE character_sheets (note TEXT)');

	assert.throws(() => openStorage(path), /table character_sheets already exists/);

	old.exec('DROP TABLE character_sheets');
	old.close();
	assert.doesNotThrow(() => openStorage(path));
});

/**
 * The Amber Road, started as the Pilgrim.
 */
const AMBER_ROAD: PlayerQuest = {
	backlogCount: 1,
	backlogUpdated: '2026-11-13T09:00:00.000Z',
	characterId: 'pilgrim',
	characterSheet: {
		abilities: [],
		stats: { attack: 0, damage: 'd4', defense: 1, maxHealth: 8 },
		traits: { strength: 0, dexterity: 0, constitution: 1, intellect: 0, wisdom: 2, charisma: 1 },
	},
	lastPlayed: null,
	pagesPlayed: 0,
	questId: 'amber-road',
	started: '2026-11-13T09:00:00.000Z',
};

test('a Player cannot start a Quest they are already playing', () => {
	const storage = openStorage(':memory:');
	storage.transaction(() => storage.startQuest('player-1', AMBER_ROAD));

	assert.throws(
		() => storage.transaction(() => storage.startQuest('player-1', AMBER_ROAD)),
		/UNIQUE constraint failed/,
	);
});

test("a Player's Quest without its Character Sheet is an error, not a Quest they aren't playing", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	const storage = openStorage(path);
	storage.transaction(() => storage.startQuest('player-1', AMBER_ROAD));
	const db = new DatabaseSync(path);
	db.exec("DELETE FROM character_sheets WHERE player_id = 'player-1'");
	db.close();

	assert.throws(
		() => storage.playerQuest('player-1', 'amber-road'),
		/player-1's amber-road Quest has no Character Sheet/,
	);
});

test("a Player's Character Sheet without its Quest is an error, not a Quest they aren't playing", async () => {
	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	const path = join(dir.path, 'game.sqlite');
	const storage = openStorage(path);
	storage.transaction(() => storage.startQuest('player-1', AMBER_ROAD));
	// With foreign keys off, as in the sqlite3 shell, deleting the Quest leaves its Character Sheet behind.
	const db = new DatabaseSync(path, { enableForeignKeyConstraints: false });
	db.exec("DELETE FROM player_quests WHERE player_id = 'player-1'");
	db.close();

	assert.throws(
		() => storage.playerQuest('player-1', 'amber-road'),
		/player-1's amber-road Character Sheet has no Quest/,
	);
});
