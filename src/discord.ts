/**
 * The Discord adapter: registers commands, routes them to the Game, and replies.
 */

import {
	ApplicationIntegrationType,
	ButtonStyle,
	Client,
	ComponentType,
	Events,
	InteractionContextType,
	MessageFlags,
	SeparatorSpacingSize,
	SlashCommandBuilder,
	type APIButtonComponent,
	type APIComponentInContainer,
	type APIMessageTopLevelComponent,
	type APIUnfurledMediaItem,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
} from 'discord.js';
import type { Button, Component, LinkButton, Media, TextDisplay, Thumbnail } from './components.ts';
import type { Game, Input, Reply } from './game.ts';
import { MAX_IMAGE_BYTES, type Image } from './registry.ts';
import { logger } from './log.ts';

/**
 * The most components Discord shows in one message, counting every part inside another and every button.
 */
const MAX_COMPONENTS = 40;

/**
 * The most files Discord attaches to one message.
 */
const MAX_FILES = 10;

/**
 * The most characters Discord shows in one message's texts, all together.
 */
const MAX_TEXT_LENGTH = 4000;

/**
 * Discord's color for each {@link Button} style.
 */
const BUTTON_STYLES = {
	danger: ButtonStyle.Danger,
	primary: ButtonStyle.Primary,
	secondary: ButtonStyle.Secondary,
	success: ButtonStyle.Success,
} as const;

/**
 * The slash commands, for servers and for Players who install the bot themselves.
 */
const COMMANDS = [
	new SlashCommandBuilder()
		.setName('quest')
		.setDescription('Play your quests and advance through solo, dice-driven role-playing.')
		.addSubcommand((subcommand) => subcommand.setName('start').setDescription('Start a new quest.')),
].map((builder) =>
	builder
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		.toJSON(),
);

/**
 * Logs in to Discord, registers the slash commands, and hands every slash command and button press to the Game.
 *
 * @throws When the login fails.
 */
export async function startBot({ game, token }: { game: Game; token: string }): Promise<Client> {
	const client = new Client({ intents: [] });

	client.once(Events.ClientReady, async (ready) => {
		logger.info('Logged in to Discord', { as: ready.user.tag });
		try {
			await ready.application.commands.set(COMMANDS);
			logger.info('Registered global commands', { commands: COMMANDS.map((command) => `/${command.name}`) });
		} catch (error) {
			logger.error('Could not register global commands', error);
		}
	});
	client.on(Events.Error, (error) => logger.error('Discord client error', error));
	client.on(Events.InteractionCreate, async (interaction) => {
		if (interaction.isChatInputCommand() || interaction.isButton()) await handle(interaction, game);
	});

	await client.login(token);
	return client;
}

/**
 * Runs one slash command or button press through the Game and replies only to the Player who sent it.
 *
 * @remarks
 * A button press replaces the message its button was on.
 */
async function handle(interaction: ChatInputCommandInteraction | ButtonInteraction, game: Game): Promise<void> {
	const playerId = interaction.user.id;
	const log = logger.child({
		...(interaction.isButton() ? { button: interaction.customId } : { command: `/${commandName(interaction)}` }),
		playerId,
		serverId: interaction.guildId,
	});
	let message: ReturnType<typeof toDiscord>;
	try {
		// Acknowledge before the Game commits anything, so a missed response
		// window can't leave a committed command whose reply never arrives.
		if (interaction.isButton()) await interaction.deferUpdate();
		else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const input = interaction.isButton() ? { button: interaction.customId } : toInput(commandName(interaction));
		message = toDiscord(game.handle(playerId, interaction.guildId, input, new Date()).reply);
	} catch (error) {
		log.error('Command failed', error);
		if (!interaction.deferred) return;
		const failed = toDiscord({ components: [{ content: 'Something went wrong. Try again.', type: 'textDisplay' }] });
		await interaction
			.editReply({ ...failed, attachments: [] })
			.catch((replyError) => log.error('Could not send the error reply', replyError));
		return;
	}

	// The command has committed, so a failed reply must not invite a retry.
	try {
		// A button press replaces its message, so clear the attachments it had.
		await interaction.editReply({ ...message, attachments: [] });
		log.info('Command handled');
	} catch (error) {
		log.error('Command handled, but the reply could not be sent', error);
	}
}

/**
 * The slash command's name with its subcommand, such as "quest start".
 */
function commandName(interaction: ChatInputCommandInteraction): string {
	return [interaction.commandName, interaction.options.getSubcommand(false)].filter(Boolean).join(' ');
}

/**
 * Turns a slash command, such as "quest start", into the Game's {@link Input}.
 *
 * @throws When it isn't a command the bot registers.
 */
function toInput(command: string): Input {
	switch (command) {
		case 'quest start':
			return { command: 'quest start' };
		default:
			throw new Error(`Unknown command /${command}`);
	}
}

/**
 * Each of Discord's limits on one message that `reply` breaks, described for an author or a log.
 */
export function brokenLimits({ components }: Reply): string[] {
	const images = imagesIn(components);
	const bytes = images.reduce((total, image) => total + image.data.length, 0);
	const n = (count: number) => count.toLocaleString('en-US');
	return [
		textLength(components) > MAX_TEXT_LENGTH &&
			`${n(textLength(components))} characters of text, more than the ${n(MAX_TEXT_LENGTH)} Discord shows in one message`,
		count(components) > MAX_COMPONENTS &&
			`${n(count(components))} components, more than the ${n(MAX_COMPONENTS)} Discord shows in one message`,
		images.length > MAX_FILES &&
			`${n(images.length)} images, more than the ${n(MAX_FILES)} Discord attaches to one message`,
		bytes > MAX_IMAGE_BYTES &&
			`images of ${n(bytes)} bytes together, more than the ${n(MAX_IMAGE_BYTES)} Discord attaches to one message`,
	].filter((problem) => problem !== false);
}

/**
 * Every part in `parts` and every part inside them, as Discord counts them, with each button and thumbnail.
 */
function partsIn(parts: Part[]): Part[] {
	return parts.flatMap((part) => {
		if (part.type === 'container' || part.type === 'actionRow') return [part, ...partsIn(part.components)];
		if (part.type === 'section') return [part, ...partsIn(part.components), part.accessory];
		return [part];
	});
}

/**
 * Anything Discord counts as a component.
 */
type Part = Component | Button | LinkButton | Thumbnail;

/**
 * How many components Discord counts in `parts`.
 */
function count(parts: Component[]): number {
	return partsIn(parts).length;
}

/**
 * Every text in `parts`, in order.
 */
function textsIn(parts: Component[]): TextDisplay[] {
	return partsIn(parts).filter((part) => part.type === 'textDisplay');
}

/**
 * How many characters of text `parts` hold together.
 */
function textLength(parts: Component[]): number {
	return textsIn(parts).reduce((total, { content }) => total + content.length, 0);
}

/**
 * Every image `parts` show, each once.
 */
function imagesIn(parts: Component[]): Image[] {
	const images = partsIn(parts).flatMap((part) => {
		if (part.type === 'file') return [part.file];
		if (part.type === 'mediaGallery') return part.items.map(({ media }) => media);
		if (part.type === 'thumbnail') return [part.media];
		return [];
	});
	return [...new Set(images)];
}

/**
 * Builds a {@link Reply} as one Discord message in Components V2, attaching each image it shows once.
 *
 * @throws When it breaks one of Discord's limits on a message, which startup checks every Quest's screens against.
 */
export function toDiscord(reply: Reply) {
	const problems = brokenLimits(reply);
	if (problems.length > 0) throw new Error(`Reply breaks Discord's limits: ${problems.join('; ')}`);
	const { components } = reply;
	const names = attachmentNames(imagesIn(components));
	const url = (image: Image): APIUnfurledMediaItem => ({ url: `attachment://${names.get(image)}` });
	const media = ({ description, media, spoiler }: Media) => ({
		media: url(media),
		...(description === undefined ? {} : { description }),
		...(spoiler === undefined ? {} : { spoiler }),
	});
	const button = (button: Button | LinkButton): APIButtonComponent => {
		const shared = {
			...(button.disabled === undefined ? {} : { disabled: button.disabled }),
			...(button.emoji === undefined ? {} : { emoji: { name: button.emoji } }),
			label: button.label,
			type: ComponentType.Button as const,
		};
		return button.type === 'linkButton'
			? { ...shared, style: ButtonStyle.Link, url: button.url }
			: { ...shared, custom_id: button.id, style: BUTTON_STYLES[button.style ?? 'primary'] };
	};
	const text = ({ content }: TextDisplay) => ({ content, type: ComponentType.TextDisplay as const });
	const part = (part: Exclude<Component, { type: 'container' }>): APIComponentInContainer => {
		switch (part.type) {
			case 'actionRow':
				return { components: part.components.map(button), type: ComponentType.ActionRow };
			case 'file':
				return {
					file: url(part.file),
					...(part.spoiler === undefined ? {} : { spoiler: part.spoiler }),
					type: ComponentType.File,
				};
			case 'mediaGallery':
				return { items: part.items.map(media), type: ComponentType.MediaGallery };
			case 'section':
				return {
					accessory:
						part.accessory.type === 'thumbnail'
							? { ...media(part.accessory), type: ComponentType.Thumbnail }
							: button(part.accessory),
					components: part.components.map(text),
					type: ComponentType.Section,
				};
			case 'separator':
				return {
					...(part.divider === undefined ? {} : { divider: part.divider }),
					...(part.spacing === undefined ? {} : { spacing: SEPARATOR_SPACINGS[part.spacing] }),
					type: ComponentType.Separator,
				};
			case 'textDisplay':
				return text(part);
		}
	};
	const topLevel = (component: Component): APIMessageTopLevelComponent =>
		component.type === 'container'
			? {
					...(component.accentColor === undefined ? {} : { accent_color: component.accentColor }),
					components: component.components.map(part),
					...(component.spoiler === undefined ? {} : { spoiler: component.spoiler }),
					type: ComponentType.Container,
				}
			: part(component);
	return {
		components: components.map(topLevel),
		// Cleared, so this can replace a message the bot sent with text or embeds before it used Components V2.
		content: null,
		embeds: [],
		files: [...names].map(([{ data }, name]) => ({ attachment: data, name })),
		flags: MessageFlags.IsComponentsV2 as const,
	};
}

/**
 * Discord's size for each {@link Separator} spacing.
 */
const SEPARATOR_SPACINGS = { large: SeparatorSpacingSize.Large, small: SeparatorSpacingSize.Small };

/**
 * A name for each of `images` that Discord can link to: anything but letters, digits, `.`, `-`, and `_`
 * becomes `_`, and a name already taken by another image gets a number in front, such as "2-map.png".
 */
function attachmentNames(images: Image[]): Map<Image, string> {
	const names = new Map<Image, string>();
	const taken = new Set<string>();
	for (const image of images) {
		const base = image.name.replace(/[^\w.-]/gu, '_');
		let name = base;
		for (let n = 2; taken.has(name); n++) name = `${n}-${base}`;
		taken.add(name);
		names.set(image, name);
	}
	return names;
}
