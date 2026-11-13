/**
 * Start the bot with `npm start` using `.env` variables.
 */

import { startBot } from './discord.ts';
import { createGame } from './game.ts';
import { logger } from './log.ts';
import { openStorage } from './storage.ts';

/**
 * How long a failed startup waits for its last log lines to be written before it forces Node to exit.
 */
const EXIT_GRACE_MS = 1000;

/**
 * Starts the bot.
 *
 * @remarks
 * Failures set the exit code and return, rather than calling `process.exit()` at once,
 * so the last log lines reach the log file before Node exits. A failure that throws is forced
 * to exit shortly after, in case something such as the Discord client still holds Node open.
 */
async function main(): Promise<void> {
	const {
		DB_PATH: dbPath,
		DISCORD_TOKEN: token,
		GAME_TIMEZONE: timezone,
		LOG_DIR: logDir,
		LOG_FILE: logFile,
	} = process.env;
	logger.info('Starting Quest Calendars Bot');

	if (!token || !timezone || !dbPath || !logDir || !logFile) {
		const missing = [
			!token && 'DISCORD_TOKEN',
			!timezone && 'GAME_TIMEZONE',
			!dbPath && 'DB_PATH',
			!logDir && 'LOG_DIR',
			!logFile && 'LOG_FILE',
		].filter(Boolean);
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
		storage = openStorage(dbPath);
	} catch (error) {
		logger.error(`DB_PATH can't be opened: ${dbPath}`, error);
		process.exitCode = 1;
		return;
	}
	logger.info('Opened game state', { from: dbPath });

	await startBot({ game: createGame({ storage }), token });
}

main().catch((error) => {
	logger.error('Startup failed', error);
	process.exitCode = 1;
	// A failed login can leave discord.js reconnecting without its token, which keeps Node running.
	// Exit once the log has had time to be written. The timer doesn't keep Node alive by itself.
	setTimeout(() => process.exit(), EXIT_GRACE_MS).unref();
});

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
