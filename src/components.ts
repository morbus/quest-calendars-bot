/**
 * A Reply is made with Discord's Components v2, named and shaped as Discord does.
 * The Game lays out every message from these, and the Discord adapter turns each
 * into its Discord counterpart one for one.
 *
 * @see https://discord.com/developers/docs/components/reference
 */

import type { Image } from './registry.ts';

/**
 * A row of up to five buttons.
 */
export type ActionRow = {
	/**
	 * The buttons, in order.
	 */
	components: (Button | LinkButton)[];

	/**
	 * Which kind of part this is.
	 */
	type: 'actionRow';
};

/**
 * A button the Player can press, which comes back as an Input with its `id`.
 */
export type Button = {
	/**
	 * Whether it is shown but can't be pressed.
	 */
	disabled?: boolean;

	/**
	 * An emoji shown before the label, such as "🎲".
	 */
	emoji?: string;

	/**
	 * Identifies the press to the Game; the Discord adapter passes it back unread.
	 */
	id: string;

	/**
	 * What the button says.
	 */
	label: string;

	/**
	 * Its color: primary (the default) is blurple, secondary gray, success green, and danger red.
	 */
	style?: 'danger' | 'primary' | 'secondary' | 'success';

	/**
	 * Which kind of part this is.
	 */
	type: 'button';
};

/**
 * Any part that can stand at the top level of a message.
 */
export type Component = ActionRow | Container | File | MediaGallery | Section | Separator | TextDisplay;

/**
 * A box around other parts, with an optional colored bar down its left side.
 */
export type Container = {
	/**
	 * The bar's color, as a number such as 0xd4a017.
	 */
	accentColor?: number;

	/**
	 * What the box holds, in order.
	 */
	components: (ActionRow | File | MediaGallery | Section | Separator | TextDisplay)[];

	/**
	 * Whether the box stays blurred until the Player clicks it.
	 */
	spoiler?: boolean;

	/**
	 * Which kind of part this is.
	 */
	type: 'container';
};

/**
 * A file the Player can download.
 */
export type File = {
	/**
	 * The file.
	 */
	file: Image;

	/**
	 * Whether it stays blurred until the Player clicks it.
	 */
	spoiler?: boolean;

	/**
	 * Which kind of part this is.
	 */
	type: 'file';
};

/**
 * A button that opens a web page instead of coming back to the Game.
 */
export type LinkButton = {
	/**
	 * Whether it is shown but can't be pressed.
	 */
	disabled?: boolean;

	/**
	 * An emoji shown before the label, such as "📖".
	 */
	emoji?: string;

	/**
	 * What the button says.
	 */
	label: string;

	/**
	 * Which kind of part this is.
	 */
	type: 'linkButton';

	/**
	 * The page it opens.
	 */
	url: string;
};

/**
 * One image in a {@link MediaGallery} or {@link Thumbnail}.
 */
export type Media = {
	/**
	 * What the image shows, for Players who can't see it.
	 */
	description?: string;

	/**
	 * The image.
	 */
	media: Image;

	/**
	 * Whether it stays blurred until the Player clicks it.
	 */
	spoiler?: boolean;
};

/**
 * Up to ten images, shown large.
 */
export type MediaGallery = {
	/**
	 * The images, in order.
	 */
	items: Media[];

	/**
	 * Which kind of part this is.
	 */
	type: 'mediaGallery';
};

/**
 * One to three texts, with a button or a small image beside them.
 */
export type Section = {
	/**
	 * What sits beside the texts.
	 */
	accessory: Button | LinkButton | Thumbnail;

	/**
	 * The texts, in order.
	 */
	components: TextDisplay[];

	/**
	 * Which kind of part this is.
	 */
	type: 'section';
};

/**
 * Space between parts, with or without a line across it.
 */
export type Separator = {
	/**
	 * Whether a line is drawn across it, as it is by default.
	 */
	divider?: boolean;

	/**
	 * How much space it leaves: small, the default, or large.
	 */
	spacing?: 'large' | 'small';

	/**
	 * Which kind of part this is.
	 */
	type: 'separator';
};

/**
 * Text, in Discord's Markdown: "## " starts a heading and "-# " small gray text.
 */
export type TextDisplay = {
	/**
	 * The text.
	 */
	content: string;

	/**
	 * Which kind of part this is.
	 */
	type: 'textDisplay';
};

/**
 * A small image beside a {@link Section}'s texts.
 */
export type Thumbnail = Media & {
	/**
	 * Which kind of part this is.
	 */
	type: 'thumbnail';
};
