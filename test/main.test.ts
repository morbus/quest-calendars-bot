import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tempDir } from './temp-dir.ts';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * Where the bot writes its log: in the project's logs/, wherever it's started from.
 */
const LOG_FILE = fileURLToPath(new URL('../logs/quest-calendars-bot.log', import.meta.url));

/**
 * Starts the bot from `cwd` with only `env` set, waits for it to exit, and returns its exit code and every
 * line it printed.
 */
async function start(env: Record<string, string>, cwd?: string): Promise<{ code: number | null; output: string }> {
	const child = spawn(process.execPath, [MAIN], { cwd, env: { PATH: process.env.PATH ?? '', ...env } });
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
	assert.match(output, /Missing environment variables: DISCORD_TOKEN, GAME_TIMEZONE(?!,)/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only GAME_TIMEZONE, when the token is set', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: GAME_TIMEZONE(?!,)/);
	assert.doesNotMatch(output, /DISCORD_TOKEN/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails when the timezone is not a real one', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token', GAME_TIMEZONE: 'Mars/Olympus_Mons' });

	assert.equal(code, 1);
	assert.match(output, /GAME_TIMEZONE is not a valid timezone: Mars\/Olympus_Mons/);
	assert.doesNotMatch(output, /Opened game state/);
});

test("startup writes its log lines to the project's logs/quest-calendars-bot.log, wherever it's started from", async () => {
	// A timezone no other run uses, so this run's line can be found among every earlier one.
	const timezone = `Mars/Test_${process.pid}_${Date.now()}`;

	await start({ DISCORD_TOKEN: 'token', GAME_TIMEZONE: timezone }, await tempDir());

	// A missing file reads as empty, so the assertion below reports it.
	const log = await readFile(LOG_FILE, 'utf8').catch(() => '');
	assert.ok(
		log.includes(`GAME_TIMEZONE is not a valid timezone: ${timezone}`),
		`this run's line is not in ${LOG_FILE}`,
	);
});
