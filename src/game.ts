/**
 * The game rules: turns a Player's Input into a Reply.
 */

import { TRAITS } from './builder.ts';
import type { ActionRow, Button, Component, Container, MediaGallery, TextDisplay } from './components.ts';
import type { Image, LoadedCharacter, LoadedQuest } from './registry.ts';
import type { Storage } from './storage.ts';

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
 * What one Input runs with.
 */
type InputContext = {
	/**
	 * When the Input arrived.
	 */
	now: Date;

	/**
	 * The Discord user ID of the Player who sent it.
	 */
	playerId: string;

	/**
	 * Every loaded Quest.
	 */
	quests: LoadedQuest[];

	/**
	 * Holds every Player's Quests and Character Sheets.
	 */
	storage: Storage;
};

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
 * Refuses to start `quest` again for a Player already playing it.
 */
function alreadyPlaying(quest: LoadedQuest): Reply {
	const advice = `You're already playing _${quest.name}_. Use \`/quest play\` to play your next Page, or \`/quest abandon\` to wipe it and start again.`;
	return { components: [box([...banner(quest.image), text(advice)])] };
}

/**
 * `image` shown large across the top of a box, or nothing when there's no image.
 */
function banner(image: Image | undefined): MediaGallery[] {
	return image === undefined ? [] : [{ items: [{ media: image }], type: 'mediaGallery' }];
}

/**
 * A box around `parts`, in order.
 */
function box(parts: Container['components']): Container {
	return { components: parts, type: 'container' };
}

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
	footer: string,
): Container {
	return box([
		...banner(image),
		text(`## ${name}\n${description}`),
		...details,
		{ type: 'separator' },
		text(`-# ${footer}`),
	]);
}

/**
 * Creates the Game.
 *
 * @param quests - Every loaded Quest.
 * @param storage - Holds every Player's Quests and Character Sheets.
 */
export function createGame({ quests, storage }: { quests: LoadedQuest[]; storage: Storage }): Game {
	return {
		handle(playerId, _serverId, input, now) {
			return storage.transaction(() => {
				if ('command' in input) return { reply: showQuest(quests, 0) };
				return { reply: pressButton({ now, playerId, quests, storage }, input.button) };
			});
		},
	};
}

/**
 * Every screen of every Quest and Character, as Players see it, and where
 * it is declared, so startup can check each fits within Discord's limits.
 */
export function everyScreen(quests: LoadedQuest[]): { reply: Reply; source: string }[] {
	return quests.flatMap((quest, index) => [
		{ reply: showQuest(quests, index), source: quest.file },
		...quest.characters.flatMap((character, i) => {
			const source = `${quest.file}: characters[${i}] (${character.id})`;
			return [
				{ reply: showQuestCharacter(quest, i), source },
				{ reply: showQuestStarted(quest, character), source: `${source}, once started` },
			];
		}),
	]);
}

/**
 * What pressing the button with id `button` does and shows.
 *
 * @throws When no button has that id.
 */
function pressButton(context: InputContext, button: string): Reply {
	const { playerId, quests, storage } = context;
	const [kind, ...args] = button.split(':');
	const unknown = new Error(`Unknown button: ${button}`);
	const questWithId = (id: string | undefined): LoadedQuest => {
		const quest = quests.find((quest) => quest.id === id);
		if (quest === undefined) throw unknown;
		return quest;
	};
	const indexIn = (digits: string | undefined, items: unknown[]): number => {
		const index = Number(digits);
		if (!/^\d+$/.test(digits ?? '') || index >= items.length) throw unknown;
		return index;
	};
	// A Quest the Player is already playing isn't started again.
	const unlessPlaying = (quest: LoadedQuest, show: () => Reply): Reply =>
		storage.playerQuest(playerId, quest.id) === undefined ? show() : alreadyPlaying(quest);
	const browsing = kind === 'prev' || kind === 'next';
	if (kind === 'quest' && args.length === 1) {
		const quest = questWithId(args[0]);
		return unlessPlaying(quest, () => showQuestCharacter(quest, 0));
	}
	if (browsing && args[0] === 'quests' && args.length === 2) return showQuest(quests, indexIn(args[1], quests));
	if (browsing && args[0] === 'characters' && args.length === 3) {
		const quest = questWithId(args[1]);
		return unlessPlaying(quest, () => showQuestCharacter(quest, indexIn(args[2], quest.characters)));
	}
	if (kind === 'character' && args.length === 2) {
		const quest = questWithId(args[0]);
		const character = quest.characters.find((character) => character.id === args[1]);
		if (character === undefined) throw unknown;
		return unlessPlaying(quest, () => startQuest(context, quest, character));
	}
	throw unknown;
}

/**
 * Shows the Quest at `index` on its own, with buttons to choose it or move to the others.
 */
function showQuest(quests: LoadedQuest[], index: number): Reply {
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
 * Shows the Character at `index` in `quest` on its own, with their Stats,
 * Traits, and Abilities, and buttons to choose them or move to the others.
 */
function showQuestCharacter(quest: LoadedQuest, index: number): Reply {
	const character = quest.characters[index]!;
	const { abilities, stats, traits } = character;
	const statLines = `Max Health ${stats.maxHealth}, Defense ${signed(stats.defense)}, Attack ${signed(stats.attack)}, Damage ${stats.damage}`;
	const traitLines = TRAITS.map((trait) => `${capitalize(trait)} ${signed(traits[trait])}`).join(', ');
	const abilityLines = abilities.map((ability) => `- ${ability.name}: ${ability.text}`);
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
				[
					text(`**Stats**\n${statLines}`),
					text(`**Traits**\n${traitLines}`),
					text(`**Abilities**\n${abilityLines.length === 0 ? 'none' : abilityLines.join('\n')}`),
				],
				`Character ${index + 1} of ${quest.characters.length} in ${quest.name}`,
			),
			browseRow(`characters:${quest.id}`, index, quest.characters.length, choose),
		],
	};
}

/**
 * Shows the Quest the Player just started: the Character they picked, with their image.
 */
function showQuestStarted(quest: LoadedQuest, character: LoadedCharacter): Reply {
	return {
		components: [
			card(
				{ image: character.image, name: quest.name },
				`You start as ${character.name}. Your first Page is ready.`,
				[text('**TODO** Instructions go here. `/quest play`'), text('**TODO** More instructions go here.')],
				'**TODO** Replace with page counter.',
			),
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
 * Starts `quest` for the Player as `character`, now, with its first Page in their Backlog, none played
 * yet, and a Character Sheet of the Character's starting Stats, Traits, and Abilities, and shows it.
 */
function startQuest({ now, playerId, storage }: InputContext, quest: LoadedQuest, character: LoadedCharacter): Reply {
	const { abilities, stats, traits } = character;
	storage.startQuest(playerId, {
		backlogCount: 1,
		backlogUpdated: now.toISOString(),
		characterId: character.id,
		characterSheet: { abilities, stats, traits },
		lastPlayed: null,
		pagesPlayed: 0,
		questId: quest.id,
		started: now.toISOString(),
	});
	return showQuestStarted(quest, character);
}

/**
 * A {@link TextDisplay} of `content`.
 */
function text(content: string): TextDisplay {
	return { content, type: 'textDisplay' };
}
