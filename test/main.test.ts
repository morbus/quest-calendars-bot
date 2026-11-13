import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, readdir, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './temp-dir.ts';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * The log file name the tests use, which differs from the one in .env.example, so the tests show LOG_FILE is read.
 */
const LOG_FILE = 'test.log';

/**
 * Starts the bot with only `env` set, waits for it to exit, and returns its exit code, every line it printed,
 * and the temporary directory it logged to.
 */
async function start(env: Record<string, string>): Promise<{ code: number | null; logDir: string; output: string }> {
	const logDir = await tempDir();
	const child = spawn(process.execPath, [MAIN], {
		env: { LOG_DIR: logDir, LOG_FILE, PATH: process.env.PATH ?? '', ...env },
	});
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	// 'close' waits for the output pipes to drain, which 'exit' doesn't.
	const [code] = await once(child, 'close');
	return { code, logDir, output };
}

test('startup fails, naming each missing variable, when none are set', async () => {
	const { code, output } = await start({ LOG_DIR: '', LOG_FILE: '' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE, DB_FILE, LOG_DIR, LOG_FILE/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only DB_FILE, when the rest are set', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: DB_FILE/);
	assert.doesNotMatch(output, /DISCORD_TOKEN|GAME_TIMEZONE|LOG_DIR|LOG_FILE/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only LOG_DIR, when the rest are set', async () => {
	const dbFile = join(await tempDir(), 'game.sqlite');

	const { code, output } = await start({ DB_FILE: dbFile, DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC', LOG_DIR: '' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: LOG_DIR(?!,)/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only LOG_FILE, when the rest are set', async () => {
	const dbFile = join(await tempDir(), 'game.sqlite');

	const { code, logDir, output } = await start({
		DB_FILE: dbFile,
		DISCORD_TOKEN: 'token',
		GAME_TIMEZONE: 'UTC',
		LOG_FILE: '',
	});

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: LOG_FILE/);
	assert.doesNotMatch(output, /Opened game state/);
	assert.deepEqual(await readdir(logDir), [], 'something was written to LOG_DIR without a LOG_FILE');
});

test('startup fails when the timezone is not a real one', async () => {
	const { code, output } = await start({
		DB_FILE: join(await tempDir(), 'game.sqlite'),
		DISCORD_TOKEN: 'token',
		GAME_TIMEZONE: 'Mars/Olympus_Mons',
	});

	assert.equal(code, 1);
	assert.match(output, /GAME_TIMEZONE is not a valid timezone: Mars\/Olympus_Mons/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup writes its log lines to LOG_FILE in LOG_DIR', async () => {
	const { logDir } = await start({});

	// A missing file reads as empty, so the assertion below reports it.
	const log = await readFile(join(logDir, LOG_FILE), 'utf8').catch(() => '');
	assert.match(log, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE/);
});

test("startup fails, naming DB_FILE, when DB_FILE can't be opened", async () => {
	const path = join(await tempDir(), 'missing', 'game.sqlite');

	const { code, output } = await start({ DB_FILE: path, DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

	assert.equal(code, 1);
	assert.match(output, /DB_FILE can't be opened: .*missing\/game\.sqlite/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming DB_FILE, when DB_FILE is not a database', async () => {
	const path = join(await tempDir(), 'notes.txt');
	await writeFile(path, 'This is not a database.');

	const { code, output } = await start({ DB_FILE: path, DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

	assert.equal(code, 1);
	assert.match(output, /DB_FILE can't be opened: .*notes\.txt/);
	assert.doesNotMatch(output, /Opened game state/);
});

// Root can write to a read-only file, so this can only be checked as another user.
test(
	"startup fails, naming DB_FILE, when DB_FILE can't be written to",
	{ skip: process.getuid?.() === 0 },
	async () => {
		const path = join(await tempDir(), 'read-only.sqlite');
		new DatabaseSync(path).close();
		await chmod(path, 0o444);

		const { code, output } = await start({ DB_FILE: path, DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

		assert.equal(code, 1);
		assert.match(output, /DB_FILE can't be opened: .*read-only\.sqlite/);
		assert.doesNotMatch(output, /Opened game state/);
	},
);
