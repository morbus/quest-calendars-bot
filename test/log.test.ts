import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { DiscordAPIError } from 'discord.js';
import winston from 'winston';

// Keep this test's log lines out of the project's logs/.
process.env.LOG_DIR = await mkdtemp(join(tmpdir(), 'quest-calendars-bot-'));
const { logger } = await import('../src/log.ts');

/**
 * Logs through the bot's logger and returns every line it wrote, as the transports see them.
 */
async function capture(log: () => void): Promise<string> {
	const stream = new PassThrough();
	let output = '';
	stream.on('data', (chunk) => (output += chunk));
	const transport = new winston.transports.Stream({ format: winston.format.json(), stream });
	logger.add(transport);
	try {
		log();
		await setImmediate();
	} finally {
		logger.remove(transport);
	}
	return output;
}

test("a failed Discord reply logs its error without the interaction token or the Player's reply", async () => {
	const error = new DiscordAPIError(
		{ code: 10062, message: 'Unknown interaction' },
		10062,
		404,
		'PATCH',
		'https://discord.com/api/v10/webhooks/111/SECRET_INTERACTION_TOKEN/messages/@original',
		{ body: { content: 'PRIVATE_REPLY_TEXT' } },
	);

	const output = await capture(() => logger.child({ playerId: 'player-1' }).error('Command failed', error));

	assert.match(output, /Command failed/);
	assert.match(output, /Unknown interaction/);
	assert.doesNotMatch(output, /SECRET_INTERACTION_TOKEN/);
	assert.doesNotMatch(output, /PRIVATE_REPLY_TEXT/);
});
