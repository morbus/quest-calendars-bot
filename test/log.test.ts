import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { DiscordAPIError, RateLimitError } from 'discord.js';
import winston from 'winston';
import { logger } from '../src/log.ts';

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

/**
 * A failed reply, as discord.js reports it: its URL holds the interaction token, and its body the Player's reply.
 */
function failedReply(): DiscordAPIError {
	return new DiscordAPIError(
		{ code: 10062, message: 'Unknown interaction' },
		10062,
		404,
		'PATCH',
		'https://discord.com/api/v10/webhooks/111/SECRET_INTERACTION_TOKEN/messages/@original',
		{ body: { content: 'PRIVATE_REPLY_TEXT' } },
	);
}

test("a failed Discord reply logs its error without the interaction token or the Player's reply", async () => {
	const error = failedReply();

	const output = await capture(() => logger.child({ playerId: 'player-1' }).error('Command failed', error));

	assert.match(output, /Command failed/);
	assert.match(output, /Unknown interaction/);
	assert.doesNotMatch(output, /SECRET_INTERACTION_TOKEN/);
	assert.doesNotMatch(output, /PRIVATE_REPLY_TEXT/);
});

test('an error nested under `error`, as an unhandled rejection logs it, also loses the token and the reply', async () => {
	const error = failedReply();

	const output = await capture(() => logger.error('Unhandled rejection', { error }));

	assert.match(output, /Unhandled rejection/);
	assert.doesNotMatch(output, /SECRET_INTERACTION_TOKEN/);
	assert.doesNotMatch(output, /PRIVATE_REPLY_TEXT/);
	assert.match(error.url, /SECRET_INTERACTION_TOKEN/, "the caller's error was changed");
});

test('a log line that is not a failed Discord request keeps its url', async () => {
	const output = await capture(() => logger.info('Fetched a page', { url: 'https://example.com/page' }));

	assert.match(output, /https:\/\/example\.com\/page/);
});

test('a nested error that is not a failed Discord request keeps its url', async () => {
	const output = await capture(() => logger.error('Fetch failed', { error: { url: 'https://example.com/page' } }));

	assert.match(output, /https:\/\/example\.com\/page/);
});

/**
 * A rate-limited reply, as discord.js reports it: its URL holds the interaction token, and it has no body.
 */
function rateLimitedReply(): RateLimitError {
	return new RateLimitError({
		global: false,
		hash: 'hash',
		limit: 5,
		majorParameter: '111',
		method: 'PATCH',
		retryAfter: 1000,
		route: '/webhooks/111/:token/messages/@original',
		scope: 'user',
		sublimitTimeout: 0,
		timeToReset: 1000,
		url: 'https://discord.com/api/v10/webhooks/111/SECRET_INTERACTION_TOKEN/messages/@original',
	});
}

test('a rate-limited Discord reply logs its error without the interaction token', async () => {
	const output = await capture(() => logger.error('Command failed', rateLimitedReply()));

	assert.match(output, /Command failed/);
	assert.doesNotMatch(output, /SECRET_INTERACTION_TOKEN/);
	assert.match(output, /api\/v10\/webhooks\/111\/:token\/messages\/@original/);
});

test('a null error stays null', async () => {
	const output = await capture(() => logger.error('Nothing thrown', { error: null }));

	assert.match(output, /"error":null/);
});

test("a failed first reply logs its error without the interaction token or the Player's reply", async () => {
	const error = new DiscordAPIError(
		{ code: 10062, message: 'Unknown interaction' },
		10062,
		404,
		'POST',
		'https://discord.com/api/v10/interactions/111/SECRET_INTERACTION_TOKEN/callback',
		{ body: { data: { content: 'PRIVATE_REPLY_TEXT' }, type: 4 } },
	);

	const output = await capture(() => logger.error('Command failed', error));

	assert.match(output, /api\/v10\/interactions\/111\/:token\/callback/);
	assert.doesNotMatch(output, /SECRET_INTERACTION_TOKEN/);
	assert.doesNotMatch(output, /PRIVATE_REPLY_TEXT/);
});
