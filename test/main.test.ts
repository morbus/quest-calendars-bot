import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './temp-dir.ts';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * Where the bot writes its log, relative to the project root, which is where the tests run from.
 */
const LOG_FILE = join('logs', 'quest-calendars-bot.log');

/**
 * Starts the bot with only `env` set, waits for it to exit, and returns its exit code and every line it printed.
 */
async function start(env: Record<string, string>): Promise<{ code: number | null; output: string }> {
	const child = spawn(process.execPath, [MAIN], { env: { PATH: process.env.PATH ?? '', ...env } });
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	// 'close' waits for the output pipes to drain, which 'exit' doesn't.
	const [code] = await once(child, 'close');
	return { code, output };
}

test('startup fails, naming each missing variable, when none are set', async () => {
	const { code, output } = await start({});

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE, DB_FILE(?!,)/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only DB_FILE, when the rest are set', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: DB_FILE(?!,)/);
	assert.doesNotMatch(output, /DISCORD_TOKEN|GAME_TIMEZONE/);
	assert.doesNotMatch(output, /Opened game state/);
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

test('startup writes its log lines to logs/quest-calendars-bot.log', async () => {
	// A timezone no other run uses, so this run's line can be found among every earlier one.
	const timezone = `Mars/Test_${process.pid}_${Date.now()}`;

	await start({ DB_FILE: join(await tempDir(), 'game.sqlite'), DISCORD_TOKEN: 'token', GAME_TIMEZONE: timezone });

	// A missing file reads as empty, so the assertion below reports it.
	const log = await readFile(LOG_FILE, 'utf8').catch(() => '');
	assert.ok(
		log.includes(`GAME_TIMEZONE is not a valid timezone: ${timezone}`),
		`this run's line is not in ${LOG_FILE}`,
	);
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
