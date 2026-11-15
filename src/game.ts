/**
 * The game rules: turns a Player's Input into a Reply.
 */

import { TRAITS, type Character } from './builder.ts';
import type { ActionRow, Button, Component, TextDisplay } from './components.ts';
import type { Image, Loaded, Quest } from './registry.ts';
import type { Storage } from './storage.ts';

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
				if ('command' in input) return { reply: showQuest(quests, 0) };
				return { reply: pressButton(quests, input.button) };
			});
		},
	};
}

/**
 * Every screen of every Quest and Character, as Players see it, with the file
 * that declared what it shows, so startup can check each fits on Discord.
 */
export function everyScreen(quests: Quest[]): { file: string; reply: Reply }[] {
	return quests.flatMap((quest, index) => [
		{ file: quest.file, reply: showQuest(quests, index) },
		...quest.characters.map((character, i) => ({ file: character.file, reply: showCharacter(quest, i) })),
	]);
}

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
 * Something a Player did, stripped of anything Discord-specific.
 */
export type Input = { command: 'quest start' } | { button: string };

/**
 * What an Input shows the Player who sent it.
 *
 * @remarks
 * The Game lays it out; the Discord adapter sends it as one message.
 */
export type Reply = {
	/**
	 * What to show, in order.
	 */
	components: Component[];
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
 * Browse a list of "Choose"-able items, with "Previous" and "Next" buttons that
 * wraparound. If the list only contains item, "Previous" and "Next" aren't shown.
 */
function browseRow(list: string, index: number, count: number, choose: Button): ActionRow {
	if (count === 1) return { components: [choose], type: 'actionRow' };
	return {
		components: [
			{ id: `prev:${list}:${(index - 1 + count) % count}`, label: 'Previous', type: 'button' },
			choose,
			{ id: `next:${list}:${(index + 1) % count}`, label: 'Next', type: 'button' },
		],
		type: 'actionRow',
	};
}

/**
 * `word` with its first letter in upper case.
 */
function capitalize(word: string): string {
	return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * A Quest or Character on its own in a box.
 */
function card(
	{ image, name }: { image?: Image; name: string },
	description: string,
	details: TextDisplay[],
	position: string,
): Component {
	return {
		components: [
			...(image === undefined ? [] : [{ items: [{ media: image }], type: 'mediaGallery' as const }]),
			text(`## ${name}\n${description}`),
			...details,
			{ type: 'separator' },
			text(`-# ${position}`),
		],
		type: 'container',
	};
}

/**
 * A Character's Stats, Traits, and Abilities, a text each under a bold name.
 */
function characterDetails({ abilities, stats, traits }: Loaded<Character>): TextDisplay[] {
	const abilityLines = abilities.map((ability) => `- ${ability.name}: ${ability.text}`);
	return [
		text(
			`**Stats**\nMax Health ${stats.maxHealth}, Defense ${signed(stats.defense)}, Attack ${signed(stats.attack)}, Damage ${stats.damage}`,
		),
		text(`**Traits**\n${TRAITS.map((trait) => `${capitalize(trait)} ${signed(traits[trait])}`).join(', ')}`),
		text(`**Abilities**\n${abilityLines.length === 0 ? 'none' : abilityLines.join('\n')}`),
	];
}

/**
 * What pressing the button with id `button` shows.
 *
 * @throws When no button has that id, such as one left from before the Quests changed.
 */
function pressButton(quests: Quest[], button: string): Reply {
	const [kind, ...args] = button.split(':');
	const unknown = new Error(`Unknown button: ${button}`);
	const questWithId = (id: string | undefined): Quest => {
		const quest = quests.find((quest) => quest.id === id);
		if (quest === undefined) throw unknown;
		return quest;
	};
	const indexIn = (digits: string | undefined, items: unknown[]): number => {
		const index = Number(digits);
		if (!/^\d+$/.test(digits ?? '') || index >= items.length) throw unknown;
		return index;
	};
	const browsing = kind === 'prev' || kind === 'next';
	if (kind === 'quest' && args.length === 1) return showCharacter(questWithId(args[0]), 0);
	if (browsing && args[0] === 'quests' && args.length === 2) return showQuest(quests, indexIn(args[1], quests));
	if (browsing && args[0] === 'characters' && args.length === 3) {
		const quest = questWithId(args[1]);
		return showCharacter(quest, indexIn(args[2], quest.characters));
	}
	if (kind === 'character' && args.length === 2) {
		if (!questWithId(args[0]).characters.some((character) => character.id === args[1])) throw unknown;
		return { components: [text('Starting a Quest is coming soon.')] };
	}
	throw unknown;
}

/**
 * Shows the Character at `index` in `quest` on its own, with their Stats, Traits, and Abilities,
 * and buttons to choose them or move to the others.
 */
function showCharacter(quest: Quest, index: number): Reply {
	const character = quest.characters[index]!;
	const choose: Button = {
		id: `character:${quest.id}:${character.id}`,
		label: 'Choose this Character',
		type: 'button',
	};
	return {
		components: [
			card(
				character,
				character.description,
				characterDetails(character),
				`Character ${index + 1} of ${quest.characters.length} in ${quest.name}`,
			),
			browseRow(`characters:${quest.id}`, index, quest.characters.length, choose),
		],
	};
}

/**
 * Shows the Quest at `index` on its own, with buttons to choose it or move to the others.
 */
function showQuest(quests: Quest[], index: number): Reply {
	const quest = quests[index]!;
	const choose: Button = {
		id: `quest:${quest.id}`,
		label: 'Choose this Quest',
		type: 'button',
	};
	return {
		components: [
			card(quest, quest.description, [], `Quest ${index + 1} of ${quests.length}`),
			browseRow('quests', index, quests.length, choose),
		],
	};
}

/**
 * A modifier with its sign, such as "+2", "+0", or "-1".
 */
function signed(modifier: number): string {
	return modifier < 0 ? `${modifier}` : `+${modifier}`;
}

/**
 * A {@link TextDisplay} of `content`.
 */
function text(content: string): TextDisplay {
	return { content, type: 'textDisplay' };
}
