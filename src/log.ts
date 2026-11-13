/**
 * Colored log lines for the console, and JSON lines in a rotated LOG_FILE in LOG_DIR.
 */

import winston from 'winston';

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
 * Where the log file goes, from the environment.
 *
 * @remarks
 * Without both, the logger writes to the console only, and main.ts reports what's missing.
 */
const { LOG_DIR: logDir, LOG_FILE: logFile } = process.env;

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
	],
});

if (logDir && logFile) {
	logger.add(
		new winston.transports.File({
			dirname: logDir,
			filename: logFile,
			maxsize: 5 * 1024 * 1024,
			maxFiles: 6,
			tailable: true,
			format: winston.format.json(),
			handleExceptions: true,
			handleRejections: true,
		}),
	);
}
