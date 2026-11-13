/**
 * Colored log lines for the console, and JSON lines in a rotated quest-calendars-bot.log.
 */

import { fileURLToPath } from 'node:url';
import winston from 'winston';

/**
 * Where the log files go: the LOG_DIR environment variable, or logs/ in the project root.
 */
const LOG_DIR = process.env.LOG_DIR || fileURLToPath(new URL('../logs/', import.meta.url));

/**
 * Formats a console line as "message \{fields\}", plus the stack, if any, on the lines below.
 */
const consoleLine = winston.format.printf(({ timestamp, level, message, stack, ...fields }) => {
	const extra = Object.keys(fields).length > 0 ? ` ${JSON.stringify(fields)}` : '';
	return `${timestamp} ${level} ${message}${extra}${stack ? `\n${stack}` : ''}`;
});

/**
 * Drops the `url` and `requestBody` that discord.js puts on a failed request's error.
 *
 * @remarks
 * A reply's URL holds the interaction's token, which lets anyone holding it answer for the bot,
 * and its body holds what only the Player should see.
 */
const dropDiscordRequest = winston.format((info) => {
	delete info.url;
	delete info.requestBody;
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
		dropDiscordRequest(),
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
			filename: 'quest-calendars-bot.log',
			maxsize: 5 * 1024 * 1024,
			maxFiles: 6,
			tailable: true,
			format: winston.format.json(),
			handleExceptions: true,
			handleRejections: true,
		}),
	],
});
