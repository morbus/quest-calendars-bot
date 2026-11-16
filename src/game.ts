/**
 * The game rules: turns a Player's Input into a Reply.
 */

import { TRAITS, type Character } from './builder.ts';
import type { ActionRow, Button, Component, TextDisplay } from './components.ts';
import type { Image, Loaded, LoadedQuest } from './registry.ts';
import type { PlayerQuest, Sheet, Storage } from './storage.ts';

/**
 * A start time for screens that look the same whenever the Player starts.
 */
const ANY_START = new Date(0);

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
	 * The Game Day the Input arrived on.
	 */
	gameDay: string;

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
	 * Holds every Player's Quests and Sheets.
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
 * Refuses to start `quest` again for a Player already playing it, pointing them to what they can do instead.
 */
function alreadyPlaying(quest: LoadedQuest): Reply {
	return {
		components: [
			text(
				`You're already playing ${quest.name}. Use \`/quest play\` to play your next Page, or \`/quest abandon\` to wipe it and start again.`,
			),
		],
	};
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
): Component {
	return {
		components: [
			...(image === undefined ? [] : [{ items: [{ media: image }], type: 'mediaGallery' as const }]),
			text(`## ${name}\n${description}`),
			...details,
			{ type: 'separator' },
			text(`-# ${footer}`),
		],
		type: 'container',
	};
}

/**
 * A Sheet's Stats, Traits, and Abilities, or a Character's starting ones, a text each under a bold name.
 */
function characterDetails({ abilities, stats, traits }: Sheet): TextDisplay[] {
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
 * Creates the Game.
 *
 * @param quests - Every loaded Quest.
 * @param storage - Holds every Player's Quests and Sheets.
 * @param timezone - The IANA timezone whose midnight starts each Game Day, such as "America/New_York".
 */
export function createGame({
	quests,
	storage,
	timezone,
}: {
	quests: LoadedQuest[];
	storage: Storage;
	timezone: string;
}): Game {
	return {
		handle(playerId, _serverId, input, now) {
			return storage.transaction(() => {
				if ('command' in input) return { reply: showQuest(quests, 0) };
				return {
					reply: pressButton({ gameDay: gameDay(now, timezone), now, playerId, quests, storage }, input.button),
				};
			});
		},
	};
}

/**
 * Every screen of every Quest and Character, as Players see it, with where it is declared:
 * the Quest's file, and a Character's place and id in `characters`, so startup can check each fits in Discord.
 * A Character's screen once started looks the same whenever they start.
 */
export function everyScreen(quests: LoadedQuest[]): { reply: Reply; source: string }[] {
	return quests.flatMap((quest, index) => [
		{ reply: showQuest(quests, index), source: quest.file },
		...quest.characters.flatMap((character, i) => {
			const source = `${quest.file}: characters[${i}] (${character.id})`;
			const started = startedQuest(quest, character, gameDay(ANY_START, 'UTC'), ANY_START);
			return [
				{ reply: showCharacter(quest, i), source },
				{ reply: showStarted(quest, character, started), source: `${source}, once started` },
			];
		}),
	]);
}

/**
 * The Game Day `now` falls on in `timezone`, as its date, such as "2026-11-13".
 */
export function gameDay(now: Date, timezone: string): string {
	const format = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		month: '2-digit',
		timeZone: timezone,
		year: 'numeric',
	});
	const parts = Object.fromEntries(format.formatToParts(now).map(({ type, value }) => [type, value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * What pressing the button with id `button` does, and shows.
 *
 * @throws When no button has that id, such as one left from before the Quests changed.
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
	// A Quest the Player is already playing shows nothing on the way to starting it again, and isn't started again.
	const unlessPlaying = (quest: LoadedQuest, show: () => Reply): Reply =>
		storage.playerQuest(playerId, quest.id) === undefined ? show() : alreadyPlaying(quest);
	const browsing = kind === 'prev' || kind === 'next';
	if (kind === 'quest' && args.length === 1) {
		const quest = questWithId(args[0]);
		return unlessPlaying(quest, () => showCharacter(quest, 0));
	}
	if (browsing && args[0] === 'quests' && args.length === 2) return showQuest(quests, indexIn(args[1], quests));
	if (browsing && args[0] === 'characters' && args.length === 3) {
		const quest = questWithId(args[1]);
		return unlessPlaying(quest, () => showCharacter(quest, indexIn(args[2], quest.characters)));
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
 * Shows the Character at `index` in `quest` on its own, with their Stats, Traits, and Abilities,
 * and buttons to choose them or move to the others.
 */
function showCharacter(quest: LoadedQuest, index: number): Reply {
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
 * Shows the Quest the Player just started: the Character they picked, with their image, and their Sheet.
 */
function showStarted(quest: LoadedQuest, character: Loaded<Character>, { sheet }: PlayerQuest): Reply {
	return {
		components: [
			card(
				{ image: character.image, name: quest.name },
				`You start as ${character.name}. Your first Page is ready.`,
				characterDetails(sheet),
				'Use `/quest play` to play it.',
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
 * `quest` as started by a Player as `character` at `now`, on the Game Day `startGameDay`: its first Page
 * in their Backlog, none played yet, and a Sheet of the Character's starting Stats, Traits, and Abilities.
 */
function startedQuest(quest: LoadedQuest, character: Loaded<Character>, startGameDay: string, now: Date): PlayerQuest {
	const { abilities, stats, traits } = character;
	return {
		backlog: 1,
		backlogUpdated: startGameDay,
		characterId: character.id,
		lastPlayed: null,
		pagesPlayed: 0,
		questId: quest.id,
		sheet: { abilities, stats, traits },
		started: now.toISOString(),
	};
}

/**
 * Starts `quest` for the Player as `character`, now, with its first Page in their Backlog
 * and a Sheet of the Character's starting Stats, Traits, and Abilities, and shows it.
 */
function startQuest(
	{ gameDay, now, playerId, storage }: InputContext,
	quest: LoadedQuest,
	character: Loaded<Character>,
): Reply {
	storage.startQuest(playerId, startedQuest(quest, character, gameDay, now));
	return showStarted(quest, character, storage.playerQuest(playerId, quest.id)!);
}

/**
 * A {@link TextDisplay} of `content`.
 */
function text(content: string): TextDisplay {
	return { content, type: 'textDisplay' };
}
