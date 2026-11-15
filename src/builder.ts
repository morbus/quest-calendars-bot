/**
 * The types and helpers that authors write Quests with.
 */

/**
 * The optional Rule Modules a Quest can turn on.
 */
export const RULE_MODULES = ['crafting', 'meal-rations', 'minions'] as const;

/**
 * The six Traits, in the order Players see them.
 */
export const TRAITS = ['strength', 'dexterity', 'constitution', 'intellect', 'wisdom', 'charisma'] as const;

/**
 * One of a Character's Abilities.
 */
export type Ability = {
	/**
	 * The Ability's name, such as "Sneaky".
	 */
	name: string;

	/**
	 * What the Ability does, as Players read it.
	 */
	text: string;
};

/**
 * A Character, one of those listed in its Quest's `characters`.
 */
export type Character = {
	/**
	 * The Character's starting Abilities, in the order Players see them.
	 */
	abilities: Ability[];

	/**
	 * Who the Character is, as Players read it before choosing them.
	 */
	description: string;

	/**
	 * Identifies the Character within its Quest: letters a–z and digits 0–9, with single hyphens between them.
	 */
	id: string;

	/**
	 * An image, such as a portrait: a .gif, .jpeg, .jpg, .png, or .webp
	 * file of at most 8 MiB, at a path relative to the Quest's directory.
	 */
	image?: string;

	/**
	 * The Character's name, as Players see it.
	 */
	name: string;

	/**
	 * The Character's starting Stats.
	 */
	stats: Stats;

	/**
	 * The Character's starting Traits.
	 */
	traits: Traits;
};

/**
 * A Quest, defined in its quest.ts.
 */
export type Quest = {
	/**
	 * The Characters a Player can choose from, in the order Players see them.
	 */
	characters: Character[];

	/**
	 * Whether the author has marked the Quest complete.
	 */
	complete: boolean;

	/**
	 * The name of the Quest's Currency, such as "gold" or "scrap".
	 */
	currency: string;

	/**
	 * What the Quest is about, as Players read it before choosing it.
	 */
	description: string;

	/**
	 * Identifies the Quest for as long as it exists: letters a–z and digits 0–9, with single hyphens between them.
	 */
	id: string;

	/**
	 * An image, such as a map or a landscape: a .gif, .jpeg, .jpg, .png, or
	 * .webp file of at most 8 MiB, at a path relative to the Quest's directory.
	 */
	image?: string;

	/**
	 * The Quest's name, as Players see it.
	 */
	name: string;

	/**
	 * The name of the Quest's Reputation, such as "Notoriety" or "Virtue".
	 */
	reputation: string;

	/**
	 * The Rule Modules the Quest turns on.
	 */
	ruleModules: RuleModule[];
};

/**
 * One of the {@link RULE_MODULES}.
 */
export type RuleModule = (typeof RULE_MODULES)[number];

/**
 * A Character's starting Stats.
 */
export type Stats = {
	/**
	 * The Attack modifier.
	 */
	attack: number;

	/**
	 * The Damage die, such as "d6" or "2d4".
	 */
	damage: string;

	/**
	 * The Defense modifier.
	 */
	defense: number;

	/**
	 * The Max Health, which is also the starting Health.
	 */
	maxHealth: number;
};

/**
 * A Character's starting Traits.
 */
export type Traits = Record<(typeof TRAITS)[number], number>;

/**
 * Turns a template written across many lines into paragraphs for a Player to read.
 *
 * @remarks
 * A line break becomes a space, and a blank line starts a new paragraph.
 * The indentation and the blank lines around the text are dropped.
 *
 * @example
 * ```ts
 * description: prose`
 *     Climb a tower of gears
 *     before it strikes midnight.
 *
 *     Somewhere above, a bell waits.
 * `,
 * ```
 */
export function prose(strings: TemplateStringsArray, ...values: unknown[]): string {
	return String.raw({ raw: strings }, ...values)
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
		.filter((paragraph) => paragraph !== '')
		.join('\n\n');
}

/**
 * Declares a Quest, as the default export of its `quest.ts`.
 */
export function quest(quest: Quest): Quest {
	return quest;
}
