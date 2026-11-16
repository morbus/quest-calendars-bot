/**
 * Start the bot with `npm start` using `.env` variables.
 */

import { brokenLimits, startBot } from './discord.ts';
import { createGame, everyScreen } from './game.ts';
import { logger } from './log.ts';
import { loadQuests } from './registry.ts';
import { openStorage } from './storage.ts';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The SQLite file that holds the game state, in the project wherever the bot is started from.
 */
const DB_FILE = fileURLToPath(new URL('../quest-calendars-bot.sqlite', import.meta.url));

/**
 * How long a failed startup waits for its last log lines to be written before it forces Node to exit.
 */
const EXIT_GRACE_MS = 1000;

/**
 * The project folder, which relative QUESTS_DIR entries resolve against, wherever the bot is started from.
 */
const PROJECT_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Whether `timezone` is one `Intl` accepts, such as "America/New_York" or "+05:00".
 */
function isTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

/**
 * Starts the bot.
 *
 * @remarks
 * Failures set the exit code and return, rather than calling `process.exit()` at once,
 * so the last log lines reach the log file before Node exits. A failure that throws is forced
 * to exit shortly after, in case something such as the Discord client still holds Node open.
 */
async function main(): Promise<void> {
	const { DISCORD_TOKEN: token, GAME_TIMEZONE: timezone, QUESTS_DIR: questsPath } = process.env;
	logger.info('Starting Quest Calendars Bot');

	if (!token || !timezone || !questsPath) {
		const missing = [!token && 'DISCORD_TOKEN', !timezone && 'GAME_TIMEZONE', !questsPath && 'QUESTS_DIR'].filter(
			Boolean,
		);
		logger.error(`Missing environment variables: ${missing.join(', ')}`);
		process.exitCode = 1;
		return;
	}

	if (!isTimezone(timezone)) {
		logger.error(`GAME_TIMEZONE is not a valid timezone: ${timezone}`);
		process.exitCode = 1;
		return;
	}

	let storage;
	try {
		storage = openStorage(DB_FILE);
	} catch (error) {
		logger.error(`Game state can't be opened: ${DB_FILE}`, error);
		process.exitCode = 1;
		return;
	}
	logger.info('Opened game state', { from: DB_FILE });

	// QUESTS_DIR lists directories separated by colons.
	const questDirs = questsPath.split(':').map((dir) => resolve(PROJECT_DIR, dir));
	let quests;
	try {
		quests = await loadQuests(questDirs);
	} catch (error) {
		logger.error(`Quests can't be loaded from QUESTS_DIR: ${questDirs.join(':')}`, error);
		process.exitCode = 1;
		return;
	}
	logger.info('Loaded Quests', { quests: quests.map((quest) => quest.name) });

	// Authors shorten what doesn't fit, rather than Players seeing it cut short.
	const unshowable = everyScreen(quests).flatMap(({ reply, source }) =>
		brokenLimits(reply).map((problem) => `${source}: its screen has ${problem}`),
	);
	if (unshowable.length > 0) {
		for (const problem of unshowable) logger.error(`Quest can't be shown in Discord: ${problem}`);
		process.exitCode = 1;
		return;
	}

	await startBot({ game: createGame({ quests, storage, timezone }), token });
}

main().catch((error) => {
	logger.error('Startup failed', error);
	process.exitCode = 1;
	// A failed login can leave discord.js reconnecting without its token, which keeps Node running.
	// Exit once the log has had time to be written. The timer doesn't keep Node alive by itself.
	setTimeout(() => process.exit(), EXIT_GRACE_MS).unref();
});
