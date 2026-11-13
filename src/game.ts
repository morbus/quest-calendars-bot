/**
 * The game rules: turns a Player's Input into a Reply.
 */

import type { Storage } from './storage.ts';

/**
 * Something a Player did, stripped of anything Discord-specific.
 */
export type Input = { command: 'quest start' };

/**
 * What an Input shows the Player who sent it.
 *
 * @remarks
 * The Discord adapter decides how it looks.
 */
export type Reply = {
	/**
	 * What to show, in order, as paragraphs of text.
	 */
	sections: string[];
};

/**
 * Everything one Input produces.
 */
export type Result = {
	/**
	 * What the Player sees.
	 */
	reply: Reply;
};

/**
 * The game rules, with no knowledge of Discord.
 */
export type Game = {
	/**
	 * Runs one Input for a Player, in its own transaction.
	 *
	 * @param playerId - The Discord user ID of the Player who sent it.
	 * @param serverId - The Discord server it was sent from, or `null` outside a server.
	 * @param input - What the Player did.
	 * @param now - When the Input arrived.
	 */
	handle(playerId: string, serverId: string | null, input: Input, now: Date): Result;
};

/**
 * Creates the Game.
 *
 * @param storage - Holds every Player's Quests and Sheets.
 */
export function createGame({ storage }: { storage: Storage }): Game {
	return {
		handle(_playerId, _serverId, _input, _now) {
			return storage.transaction(() => ({ reply: { sections: ['No Quests available'] } }));
		},
	};
}
