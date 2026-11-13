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
 * The SQLite file that holds the game state, in the project root.
 */
const DB_PATH = fileURLToPath(new URL('../quest-calendars-bot.sqlite', import.meta.url));

/**
 * Starts the bot.
 *
 * @remarks
 * Failures set the exit code and return, rather than calling `process.exit()`,
 * so the last log lines reach the log file before Node exits.
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
		logger.error(`GAME_TIMEZONE is not an IANA timezone: ${timezone}`);
		process.exitCode = 1;
		return;
	}

	const storage = openStorage(DB_PATH);
	logger.info('Opened game state', { path: DB_PATH });

	await startBot({ token, game: createGame({ dice: randomDice, storage, timezone }) });
}

/**
 * Whether `timezone` names an IANA timezone, such as "America/New_York".
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
});
