import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtempDisposable, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The CLI entry point, as `npm start` runs it.
 */
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/**
 * The project folder, which relative QUESTS_DIR entries resolve against.
 */
const PROJECT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Where the bot writes its log: in the project's logs/, wherever it's started from.
 */
const LOG_FILE = fileURLToPath(new URL('../logs/quest-calendars-bot.log', import.meta.url));

/**
 * Starts the bot from `cwd` with only `env` set, waits for an exit, and returns its exit code and every line printed.
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
	assert.match(output, /Missing environment variables: DISCORD_TOKEN, QUESTS_DIR(?!,)/);
	assert.doesNotMatch(output, /Opened game state/);
});

test('startup fails, naming only QUESTS_DIR, when the token is set', async () => {
	const { code, output } = await start({ DISCORD_TOKEN: 'token' });

	assert.equal(code, 1);
	assert.match(output, /Missing environment variables: QUESTS_DIR(?!,)/);
	assert.doesNotMatch(output, /DISCORD_TOKEN/);
	assert.doesNotMatch(output, /Opened game state/);
});

test("startup writes its log lines to the project's logs/quest-calendars-bot.log, wherever it's started from", async () => {
	// A Quest directory no other run uses, so this run's line can be found among every earlier one.
	const questsDir = `nowhere-${process.pid}-${Date.now()}`;

	await using dir = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await start({ DISCORD_TOKEN: 'token', QUESTS_DIR: questsDir }, dir.path);

	// A missing file reads as empty, so the assertion below reports it.
	const log = await readFile(LOG_FILE, 'utf8').catch(() => '');
	assert.ok(
		log.includes(`Quests can't be loaded from QUESTS_DIR: ${join(PROJECT, questsDir)}`),
		`this run's line is not in ${LOG_FILE}`,
	);
});

test('startup fails, naming the file, when a Quest in any QUESTS_DIR directory is invalid', async () => {
	await using cwd = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await using broken = await mkdtempDisposable(join(tmpdir(), 'quest-calendars-bot-'));
	await mkdir(join(broken.path, 'nameless'));
	await writeFile(join(broken.path, 'nameless', 'quest.ts'), 'export default {};\n');
	// Relative entries resolve against the project folder, not where the bot is started from.
	const dirs = ['test/fixtures/quests', relative(PROJECT, broken.path)].join(':');

	const { code, output } = await start({ DISCORD_TOKEN: 'token', QUESTS_DIR: dirs }, cwd.path);

	assert.equal(code, 1);
	assert.match(output, /Quests can't be loaded/);
	assert.match(
		output,
		/nameless\/quest\.ts: id must be letters a–z and digits 0–9, with single hyphens between them, not undefined/,
	);
});

test("startup fails, naming where each is declared, when a Quest's or Character's screen has more text than Discord shows", async () => {
	const { code, output } = await start({
		DISCORD_TOKEN: 'token',
		QUESTS_DIR: 'test/fixtures/quests:test/fixtures/long-quests',
	});

	assert.equal(code, 1);
	for (const source of [
		'quest\\.ts',
		'quest\\.ts: characters\\[0\\] \\(archivist\\)',
		'quest\\.ts: characters\\[1\\] \\(reader\\)',
	]) {
		assert.match(
			output,
			new RegExp(
				`Quest can't be shown in Discord: \\S*endless-library/${source}: its screen has [\\d,]+ characters of text, more than the 4,000 Discord shows in one message`,
			),
		);
	}
	assert.doesNotMatch(output, /clockwork-tower|pilgrimage/);
	assert.doesNotMatch(output, /Logged in/);
});
