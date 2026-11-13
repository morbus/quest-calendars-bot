import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * Starts the bot with only `env` set, waits for it to exit, and returns its exit code, every line it printed,
 * and the temporary directory it logged to.
 */
async function start(env: Record<string, string>): Promise<{ code: number | null; logDir: string; output: string }> {
	const logDir = await mkdtemp(join(tmpdir(), 'quest-calendars-bot-'));
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
