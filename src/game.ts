/**
 * The game rules: turns a Player's Input into a Reply and any Announcements.
 */

import type { Storage } from './storage.ts';

/**
 * Something a Player did, stripped of anything Discord-specific.
 */
export type Input = { command: 'quest start' };

/**
 * A public, spoiler-free note that a Player finished a Page.
 */
export type Announcement = {
	/**
	 * What the Announcement says.
	 */
	text: string;
};

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
	 * The Announcements to post: at most one, when the Input finished a Page.
	 */
	announcements: Announcement[];

	/**
	 * What the Player sees.
	 */
	reply: Reply;
};

/**
 * Rolls dice.
 *
 * @remarks
 * Production rolls at random, and tests script the rolls.
 */
export type Dice = {
	/**
	 * Rolls one die.
	 *
	 * @param sides - How many sides the die has, such as 20 for a d20.
	 * @returns A whole number from 1 to `sides`.
	 */
	roll(sides: number): number;
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
 * @param dice - Rolls every die the Game needs.
 * @param storage - Holds every Player's Quests and Sheets.
 * @param timezone - The IANA timezone whose midnight starts each Game Day.
 *
 * @remarks
 * Nothing rolls dice or counts Game Days yet, so `dice` and `timezone` wait for the rules that need them.
 */
export function createGame({ storage }: { dice: Dice; storage: Storage; timezone: string }): Game {
	return {
		handle(_playerId, _serverId, _input, _now) {
			return storage.transaction(() => ({ announcements: [], reply: { sections: ['No Quests available'] } }));
		},
	};
}
