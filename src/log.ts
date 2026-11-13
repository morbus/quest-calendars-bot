/**
 * Colored log lines for the console, and JSON lines in a rotated quest-calendars-bot.log.
 */

import { accessSync, constants, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import winston from 'winston';

/**
 * Where the log files go: the LOG_DIR environment variable, or logs/ in the project root.
 */
const LOG_DIR = process.env.LOG_DIR || fileURLToPath(new URL('../logs/', import.meta.url));

/**
 * The name of the current log file in {@link LOG_DIR}.
 */
const LOG_FILE = 'quest-calendars-bot.log';

/**
 * Creates `dir` if needed, and checks that the logs can be written there and the directory entered.
 *
 * @remarks
 * Run before the logger exists, so a bad directory or log file stops startup with its name,
 * instead of crashing on the first write or leaving the log file silently empty.
 *
 * @throws When `dir` can't be created, entered, or written to, or it holds a log file that can't be written to.
 */
function prepareLogDir(dir: string): void {
	try {
		mkdirSync(dir, { recursive: true });
		accessSync(dir, constants.W_OK | constants.X_OK);
	} catch (error) {
		throw new Error(`LOG_DIR is not a directory that can be written to: ${dir}`, { cause: error });
	}

	const file = join(dir, LOG_FILE);
	if (!existsSync(file)) return;
	try {
		accessSync(file, constants.W_OK);
	} catch (error) {
		throw new Error(`LOG_DIR has a log file that can't be written to: ${file}`, { cause: error });
	}
}

prepareLogDir(LOG_DIR);

/**
 * Formats a console line as "message \{fields\}", plus the stack, if any, on the lines below.
 */
const consoleLine = winston.format.printf(({ timestamp, level, message, stack, ...fields }) => {
	const extra = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
	return `${timestamp} ${level} ${message}${extra}${stack ? `\n${stack}` : ''}`;
});

/**
 * The interaction token in a Discord webhook or interaction URL, after the ID it belongs to.
 */
const DISCORD_TOKEN_IN_URL = /(\/(?:webhooks|interactions)\/\d+\/)[^/?]+/g;

/**
 * Masks the token in a `url` field and drops a `requestBody` field, as discord.js puts on a failed request's error.
 */
function scrubDiscordRequest(fields: Record<string, unknown>): void {
	delete fields.requestBody;
	if (typeof fields.url === 'string') fields.url = fields.url.replace(DISCORD_TOKEN_IN_URL, '$1:token');
}

/**
 * Keeps Discord's interaction tokens and request bodies out of the logs.
 *
 * @remarks
 * A reply's URL holds the interaction's token, which lets anyone holding it answer for the bot,
 * and its body holds what only the Player should see. The rest of the URL is kept, for debugging.
 */
const redactDiscordRequests = winston.format((info) => {
	scrubDiscordRequest(info);
	// Unhandled exceptions and rejections arrive nested under `error`. Copy it rather than change the caller's error.
	if (typeof info.error === 'object' && info.error !== null) {
		const error: Record<string, unknown> = { ...info.error };
		scrubDiscordRequest(error);
		info.error = error;
	}
	return info;
});

/**
 * The bot's logger.
 *
 * @remarks
 * Use `logger.child()` to add fields to every line.
 */
export const logger = winston.createLogger({
	level: 'info',
	format: winston.format.combine(
		winston.format.errors({ stack: true }),
		redactDiscordRequests(),
		winston.format.timestamp(),
	),
	transports: [
		new winston.transports.Console({
			format: winston.format.combine(consoleLine, winston.format.colorize({ all: true })),
			handleExceptions: true,
			handleRejections: true,
		}),
		new winston.transports.File({
			dirname: LOG_DIR,
			filename: LOG_FILE,
			maxsize: 5 * 1024 * 1024,
			maxFiles: 6,
			tailable: true,
			format: winston.format.json(),
			handleExceptions: true,
			handleRejections: true,
		}),
	],
});
