/**
 * The game rules: turns a Player's Input into a Reply.
 */

import { TRAITS, type Character } from './builder.ts';
import type { Quest } from './registry.ts';
import type { Storage } from './storage.ts';

/**
 * Something a Player did, stripped of anything Discord-specific.
 */
export type Input = { command: 'quest start' } | { button: string };

/**
 * What an Input shows the Player who sent it.
 *
 * @remarks
 * The Discord adapter decides how it looks.
 */
export type Reply = {
	/**
	 * The buttons to offer, in order.
	 */
	buttons?: Button[];
	/**
	 * What to show, in order.
	 */
	sections: Section[];
};

/**
 * One paragraph of a {@link Reply}.
 */
export type Section = {
	/**
	 * The full path of an image file to show with it.
	 */
	image?: string;
	/**
	 * What the paragraph says.
	 */
	text: string;
};

/**
 * A button the Player can press, which comes back as an Input with its `id`.
 */
export type Button = {
	/**
	 * Identifies the press to the Game; the Discord adapter passes it back unread.
	 */
	id: string;
	/**
	 * What the button says.
	 */
	label: string;
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
 * @param quests - Every loaded Quest.
 * @param storage - Holds every Player's Quests and Sheets.
 */
export function createGame({ quests, storage }: { quests: Quest[]; storage: Storage }): Game {
	return {
		handle(_playerId, _serverId, input, _now) {
			return storage.transaction(() => {
				if ('command' in input) return { reply: listQuests(quests) };
				const quest = quests.find((quest) => questButtonId(quest) === input.button);
				if (!quest) throw new Error(`Unknown button: ${input.button}`);
				return { reply: listCharacters(quest) };
			});
		},
	};
}

/**
 * Offers each Quest as a button, or says none are ready yet.
 */
function listQuests(quests: Quest[]): Reply {
	if (quests.length === 0) return { sections: [{ text: 'Quests are coming soon.' }] };
	return {
		sections: [
			{ text: 'Choose a Quest.' },
			...quests.map((quest) => section(quest, `${quest.name}\n${quest.description}`)),
		],
		buttons: quests.map((quest) => ({ id: questButtonId(quest), label: quest.name })),
	};
}

/**
 * The id of the button that chooses `quest`.
 */
function questButtonId(quest: Quest): string {
	return `quest:${quest.id}`;
}

/**
 * Shows each of a Quest's Characters with their Stats, Traits, and Abilities.
 */
function listCharacters(quest: Quest): Reply {
	return {
		sections: [
			{ text: `Characters in ${quest.name}:` },
			...quest.characters.map((character) => section(character, describeCharacter(character))),
		],
	};
}

/**
 * A Character's name and description, then a line each for their Stats, Traits, and Abilities.
 */
function describeCharacter({ abilities, description, name, stats, traits }: Character): string {
	return [
		name,
		description,
		`Stats: Max Health ${stats.maxHealth}, Defense ${signed(stats.defense)}, Attack ${signed(stats.attack)}, Damage ${stats.damage}`,
		`Traits: ${TRAITS.map((trait) => `${capitalize(trait)} ${signed(traits[trait])}`).join(', ')}`,
		abilities.length === 0 ? 'Abilities: none' : 'Abilities:',
		...abilities.map((ability) => `- ${ability.name}: ${ability.text}`),
	].join('\n');
}

/**
 * A section that says `text`, with the image of the Quest or Character it's about, if any.
 */
function section({ image }: { image?: string }, text: string): Section {
	return image === undefined ? { text } : { image, text };
}

/**
 * A modifier with its sign, such as "+2", "+0", or "-1".
 */
function signed(modifier: number): string {
	return modifier < 0 ? `${modifier}` : `+${modifier}`;
}

/**
 * `word` with its first letter in upper case.
 */
function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}
