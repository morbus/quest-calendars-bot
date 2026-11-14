/**
 * The helpers authors write Quests with (ADR 0001).
 *
 * @remarks
 * Each Quest is a directory in quests/ holding a `quest.ts` that exports {@link quest} by default,
 * and a characters/ directory with one `.ts` file per Character that exports {@link character}.
 */

/**
 * The optional Rule Modules a Quest can turn on.
 */
export const RULE_MODULES = ['exploration', 'meal-rations', 'meter'] as const;

/**
 * One of the {@link RULE_MODULES}.
 */
export type RuleModule = (typeof RULE_MODULES)[number];

/**
 * A Quest's metadata, from its `quest.ts`.
 */
export type QuestMetadata = {
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
	 * Identifies the Quest for as long as it exists: lowercase letters, digits, and hyphens.
	 */
	id: string;
	/**
	 * An image to show with it, such as a map or a portrait: a .gif, .jpeg, .jpg, .png, or .webp file,
	 * relative to this file. Once loaded, the file's full path.
	 */
	image?: string;
	/**
	 * The name of the meter, such as "Notoriety", when the Quest turns on the meter Rule Module.
	 */
	meter?: string;
	/**
	 * The Quest's name, as Players see it.
	 */
	name: string;
	/**
	 * The Rule Modules the Quest turns on.
	 */
	ruleModules: RuleModule[];
};

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
 * The six Traits, in the order Players see them.
 */
export const TRAITS = ['strength', 'dexterity', 'constitution', 'intellect', 'wisdom', 'charisma'] as const;

/**
 * A Character's starting Traits.
 */
export type Traits = Record<(typeof TRAITS)[number], number>;

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
 * A Character, from one file in its Quest's characters/ directory.
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
	 * Identifies the Character within its Quest: lowercase letters, digits, and hyphens.
	 */
	id: string;
	/**
	 * An image to show with it, such as a map or a portrait: a .gif, .jpeg, .jpg, .png, or .webp file,
	 * relative to this file. Once loaded, the file's full path.
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
 * Declares a Quest's metadata, as the default export of its `quest.ts`.
 */
export function quest(metadata: QuestMetadata): QuestMetadata {
	return metadata;
}

/**
 * Declares a Character, as the default export of its file in characters/.
 */
export function character(character: Character): Character {
	return character;
}
