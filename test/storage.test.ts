import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openStorage } from '../src/storage.ts';
import { tempDir } from './temp-dir.ts';

test('a file in a folder that does not exist cannot be opened', async () => {
	const path = join(await tempDir(), 'missing', 'game.sqlite');

	assert.throws(() => openStorage(path), /unable to open database file/);
});

test('a file that is not a SQLite database cannot be opened', async () => {
	const path = join(await tempDir(), 'notes.txt');
	await writeFile(path, 'This is not a database.');

	assert.throws(() => openStorage(path), /file is not a database/);
});

// Root can write to a read-only file, so this can only be checked as another user.
test('a database that cannot be written to cannot be opened', { skip: process.getuid?.() === 0 }, async () => {
	const path = join(await tempDir(), 'read-only.sqlite');
	new DatabaseSync(path).close();
	await chmod(path, 0o444);

	assert.throws(() => openStorage(path), /attempt to write a readonly database/);
});

test('a new database can be opened and used', async () => {
	const storage = openStorage(join(await tempDir(), 'game.sqlite'));

	assert.equal(
		storage.transaction(() => 'done'),
		'done',
	);
});
