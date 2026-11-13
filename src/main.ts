/**
 * Start the bot with `npm start` using `.env` variables.
 */

import { randomDice } from './dice.ts';
import { startBot } from './discord.ts';
import { createGame } from './game.ts';
import { logger } from './log.ts';
import { openStorage } from './storage.ts';
import { fileURLToPath } from 'node:url';

/**
 * The SQLite file that holds the game state: the DB_PATH environment variable,
 * or quest-calendars-bot.sqlite in the project root.
 */
const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../quest-calendars-bot.sqlite', import.meta.url));

/**
 * Starts the bot.
 *
 * @remarks
 * Failures set the exit code and return, rather than calling `process.exit()` at once,
 * so the last log lines reach the log file before Node exits. A failure that throws is forced
 * to exit shortly after, in case something such as the Discord client still holds Node open.
 */
async function main(): Promise<void> {
	logger.info('Starting Quest Calendars Bot');

	const token = process.env.DISCORD_TOKEN;
	const timezone = process.env.GAME_TIMEZONE;
	if (!token || !timezone) {
		const missing = [!token && 'DISCORD_TOKEN', !timezone && 'GAME_TIMEZONE'].filter(Boolean);
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
		storage = openStorage(DB_PATH);
	} catch (error) {
		logger.error(`DB_PATH can't be opened: ${DB_PATH}`, error);
		process.exitCode = 1;
		return;
	}
	logger.info('Opened game state', { path: DB_PATH });

	await startBot({ game: createGame({ dice: randomDice, storage, timezone }), token });
}

/**
 * How long a failed startup waits for its last log lines to be written before it forces Node to exit.
 */
const EXIT_GRACE_MS = 1000;

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

main().catch((error) => {
	logger.error('Startup failed', error);
	process.exitCode = 1;
	// A failed login can leave discord.js reconnecting without its token, which keeps Node running.
	// Exit once the log has had time to be written. The timer doesn't keep Node alive by itself.
	setTimeout(() => process.exit(), EXIT_GRACE_MS).unref();
});
