import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './temp-dir.ts';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * Skips a permissions test when running as root, which can read, write, and enter anything regardless of its mode.
 */
const skipAsRoot = { skip: process.getuid?.() === 0 };

/**
 * Starts the bot with only `env` set, waits for it to exit, and returns its exit code, every line it printed,
 * and the temporary directory it logged to.
 */
async function start(env: Record<string, string>): Promise<{ code: number | null; logDir: string; output: string }> {
	const logDir = await tempDir();
	const child = spawn(process.execPath, [MAIN], { env: { LOG_DIR: logDir, PATH: process.env.PATH ?? '', ...env } });
	let output = '';
	child.stdout.on('data', (chunk) => (output += chunk));
	child.stderr.on('data', (chunk) => (output += chunk));
	// 'close' waits for the output pipes to drain, which 'exit' doesn't.
	const [code] = await once(child, 'close');
	return { code, logDir, output };
}

test('startup fails, naming each missing variable, when the token and timezone are missing', async () => {
	const { code, output } = await start({});

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only the timezone, when the token is set', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: GAME_TIMEZONE/);
	assert.doesNotMatch(output, /DISCORD_TOKEN/);
});

test('startup fails when the timezone is not a real one', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'Mars/Olympus_Mons' });

	assert.equal(code, 1);
	assert.match(output, /GAME_TIMEZONE is not a valid timezone: Mars\/Olympus_Mons/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup writes its log file to LOG_DIR', async () => {
	const { logDir } = await start({});

	// A missing file reads as empty, so the assertion below reports it.
	const log = await readFile(join(logDir, 'quest-calendars-bot.log'), 'utf8').catch(() => '');
	assert.match(log, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE/);
});

test('startup fails, naming LOG_DIR, when LOG_DIR is a file', async () => {
	const file = join(await tempDir(), 'not-a-directory');
	await writeFile(file, '');

	const { code, output } = await start({ LOG_DIR: file });

	assert.equal(code, 1);
	assert.match(output, /LOG_DIR is not a directory that can be written to: .*not-a-directory/);
});

test('startup fails, naming LOG_DIR, when LOG_DIR is read-only', skipAsRoot, async () => {
	const dir = join(await tempDir(), 'read-only');
	await mkdir(dir);
	await chmod(dir, 0o555);

	const { code, output } = await start({ LOG_DIR: dir });

	assert.equal(code, 1);
	assert.match(output, /LOG_DIR is not a directory that can be written to: .*read-only/);
});

test('startup fails, naming the file, when the log file in LOG_DIR is read-only', skipAsRoot, async () => {
	const dir = await tempDir();
	const file = join(dir, 'quest-calendars-bot.log');
	await writeFile(file, '');
	await chmod(file, 0o444);

	const { code, output } = await start({ LOG_DIR: dir });

	assert.equal(code, 1);
	assert.match(output, /LOG_DIR has a log file that can't be written to: .*quest-calendars-bot\.log/);
});

test("startup fails, naming LOG_DIR, when LOG_DIR can't be entered", skipAsRoot, async () => {
	const dir = join(await tempDir(), 'no-entry');
	await mkdir(dir);
	await chmod(dir, 0o600);

	const { code, output } = await start({ LOG_DIR: dir });

	assert.equal(code, 1);
	assert.match(output, /LOG_DIR is not a directory that can be written to: .*no-entry/);
});

test("startup fails, naming DB_PATH, when DB_PATH can't be opened", async () => {
	const path = join(await tempDir(), 'missing', 'game.sqlite');

	const { code, output } = await start({ DB_PATH: path, DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'UTC' });

	assert.equal(code, 1);
	assert.match(output, /DB_PATH can't be opened: .*missing\/game\.sqlite/);
	assert.doesNotMatch(output, /Opened game state/);
});
