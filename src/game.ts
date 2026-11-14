/**
 * The game rules: turns a Player's Input into a Reply.
 */

import { TRAITS, type Character } from './builder.ts';
import type { Image, Loaded, Quest } from './registry.ts';
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
	 * One thing to show on its own, such as a Quest or a Character, after the sections.
	 */
	card?: Card;
	/**
	 * What to show, in order.
	 */
	sections: Section[];
};

/**
 * One Quest or Character, shown on its own with its image.
 */
export type Card = {
	/**
	 * What it is about.
	 */
	description: string;
	/**
	 * Named details, in order, such as a Character's Stats, Traits, and Abilities.
	 */
	fields: Field[];
	/**
	 * Where it sits among the others, such as "Quest 1 of 2".
	 */
	footer: string;
	/**
	 * An image to show with it.
	 */
	image?: Image;
	/**
	 * Its name.
	 */
	title: string;
};

/**
 * One named detail of a {@link Card}.
 */
export type Field = {
	/**
	 * What the detail is, such as "Stats".
	 */
	name: string;
	/**
	 * The detail itself.
	 */
	value: string;
};

/**
 * One paragraph of a {@link Reply}.
 */
export type Section = {
	/**
	 * An image to show with it.
	 */
	image?: Image;
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
	 * Whether it is shown but can't be pressed, such as Previous on the first page.
	 */
	disabled?: boolean;
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
				if ('command' in input) return { reply: showQuest(quests, 0) };
				const questPage = /^(?:prev|next):quests:(\d+)$/.exec(input.button);
				if (questPage) return { reply: showQuest(quests, page(questPage[1], quests, input.button)) };
				const characterPage = /^(?:prev|next):characters:([a-z0-9-]+):(\d+)$/.exec(input.button);
				if (characterPage) {
					const quest = quests.find((quest) => quest.id === characterPage[1]);
					if (!quest) throw new Error(`Unknown button: ${input.button}`);
					return { reply: showCharacter(quest, page(characterPage[2], quest.characters, input.button)) };
				}
				const chosen = /^character:([a-z0-9-]+):(\d+)$/.exec(input.button);
				if (chosen) {
					const quest = quests.find((quest) => quest.id === chosen[1]);
					if (!quest) throw new Error(`Unknown button: ${input.button}`);
					page(chosen[2], quest.characters, input.button);
					return { reply: { sections: [{ text: 'Starting a Quest is coming soon.' }] } };
				}
				const quest = quests.find((quest) => questButtonId(quest) === input.button);
				if (!quest) throw new Error(`Unknown button: ${input.button}`);
				return { reply: showCharacter(quest, 0) };
			});
		},
	};
}

/**
 * Shows the Quest at `index` on its own, with buttons to choose it or page to the others,
 * or says none are ready yet.
 */
function showQuest(quests: Quest[], index: number): Reply {
	const quest = quests[index];
	if (quest === undefined) return { sections: [{ text: 'Quests are coming soon.' }] };
	const [previous, next] = pageButtons('quests', index, quests.length);
	return {
		buttons: [previous, { id: questButtonId(quest), label: 'Choose this Quest' }, next],
		card: card(quest, quest.description, [], `Quest ${index + 1} of ${quests.length}`),
		sections: [{ text: 'Choose a Quest.' }],
	};
}

/**
 * Previous and Next buttons for page `index` of `count`, whose ids lead to the page before and after it,
 * wrapping around at either end. Both are disabled when there's only one page.
 *
 * @remarks
 * Each id starts with its direction, so the two differ even when they lead to the same page.
 */
function pageButtons(list: string, index: number, count: number): [Button, Button] {
	const disabled = count === 1;
	return [
		{ disabled, id: `prev:${list}:${(index - 1 + count) % count}`, label: 'Previous' },
		{ disabled, id: `next:${list}:${(index + 1) % count}`, label: 'Next' },
	];
}

/**
 * The page a button's id leads to in `items`.
 *
 * @throws When there's no such page, such as after the Quests changed.
 */
function page(digits: string | undefined, items: unknown[], button: string): number {
	const index = Number(digits);
	if (!(index < items.length)) throw new Error(`Unknown button: ${button}`);
	return index;
}

/**
 * The id of the button that chooses `quest`.
 */
function questButtonId(quest: Quest): string {
	return `quest:${quest.id}`;
}

/**
 * Shows the Character at `index` in `quest` on its own, with their Stats, Traits, and Abilities,
 * and buttons to choose them or page to the others.
 */
function showCharacter(quest: Quest, index: number): Reply {
	const character = quest.characters[index]!;
	const count = quest.characters.length;
	const [previous, next] = pageButtons(`characters:${quest.id}`, index, count);
	return {
		buttons: [previous, { id: `character:${quest.id}:${index}`, label: 'Choose this Character' }, next],
		card: card(
			character,
			character.description,
			characterFields(character),
			`Character ${index + 1} of ${count} in ${quest.name}`,
		),
		sections: [{ text: `Choose a Character for ${quest.name}.` }],
	};
}

/**
 * A Character's Stats, Traits, and Abilities, a field each.
 */
function characterFields({ abilities, stats, traits }: Loaded<Character>): Field[] {
	return [
		{
			name: 'Stats',
			value: `Max Health ${stats.maxHealth}, Defense ${signed(stats.defense)}, Attack ${signed(stats.attack)}, Damage ${stats.damage}`,
		},
		{ name: 'Traits', value: TRAITS.map((trait) => `${capitalize(trait)} ${signed(traits[trait])}`).join(', ') },
		{
			name: 'Abilities',
			value:
				abilities.length === 0 ? 'none' : abilities.map((ability) => `- ${ability.name}: ${ability.text}`).join('\n'),
		},
	];
}

/**
 * A card for a Quest or Character, with its image, if any.
 */
function card(
	{ image, name }: { image?: Image; name: string },
	description: string,
	fields: Field[],
	footer: string,
): Card {
	const shown = { description, fields, footer, title: name };
	return image === undefined ? shown : { ...shown, image };
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
