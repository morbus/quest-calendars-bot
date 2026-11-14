/**
 * The Discord adapter: registers commands, routes them to the Game, and replies.
 */

import {
	ActionRowBuilder,
	ApplicationIntegrationType,
	ButtonBuilder,
	ButtonStyle,
	Client,
	Events,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
	type ButtonInteraction,
	type ChatInputCommandInteraction,
} from 'discord.js';
import type { Button, Game, Input, Reply } from './game.ts';
import { logger } from './log.ts';

/**
 * The most buttons Discord shows in one row.
 */
const BUTTONS_PER_ROW = 5;

/**
 * The most characters of text Discord shows in one message.
 */
const MAX_CONTENT_LENGTH = 2000;

/**
 * The most files Discord attaches to one message.
 */
const MAX_FILES = 10;

/**
 * Splits text into graphemes, the characters a reader sees, keeping emoji such as flags whole.
 */
const GRAPHEMES = new Intl.Segmenter('en', { granularity: 'grapheme' });

/**
 * One Discord message of a {@link Reply}, before discord.js builds it.
 */
export type Message = {
	/**
	 * The buttons below the text, in rows.
	 */
	buttonRows: Button[][];
	/**
	 * The text, at most {@link MAX_CONTENT_LENGTH} characters.
	 */
	content: string;
	/**
	 * The full paths of the images to attach, at most {@link MAX_FILES}.
	 */
	files: string[];
};

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
	let reply: Reply;
	try {
		// Acknowledge before the Game commits anything, so a missed response
		// window can't leave a committed command whose reply never arrives.
		if (interaction.isButton()) await interaction.deferUpdate();
		else await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const input = interaction.isButton() ? { button: interaction.customId } : toInput(commandName(interaction));
		({ reply } = game.handle(playerId, interaction.guildId, input, new Date()));
	} catch (error) {
		log.error('Command failed', error);
		if (!interaction.deferred) return;
		await interaction
			.editReply({ content: 'Something went wrong. Try again.' })
			.catch((replyError) => log.error('Could not send the error reply', replyError));
		return;
	}

	// The command has committed, so a failed reply must not invite a retry.
	try {
		const [first, ...rest] = toMessages(reply).map(toDiscord);
		// A button press replaces its message, so clear the attachments it had.
		await interaction.editReply({ ...first, attachments: [] });
		for (const message of rest) await interaction.followUp({ ...message, flags: MessageFlags.Ephemeral });
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
 * Splits a {@link Reply} into as few Discord messages as fit its text and images, with its buttons on the last.
 *
 * @remarks
 * Sections are joined by a blank line. A section that won't fit in one message is split at a line break,
 * or else between graphemes.
 */
export function toMessages(reply: Reply): Message[] {
	const messages: Message[] = [];
	for (const section of reply.sections) {
		for (const [i, text] of splitText(section.text).entries()) {
			const files = i === 0 && section.image !== undefined ? [section.image] : [];
			const last = messages.at(-1);
			const joined = last && `${last.content}\n\n${text}`;
			if (last && joined && joined.length <= MAX_CONTENT_LENGTH && last.files.length + files.length <= MAX_FILES) {
				last.content = joined;
				last.files.push(...files);
			} else {
				messages.push({ buttonRows: [], content: text, files });
			}
		}
	}
	const buttons = reply.buttons ?? [];
	for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
		messages.at(-1)?.buttonRows.push(buttons.slice(i, i + BUTTONS_PER_ROW));
	}
	return messages;
}

/**
 * Splits `text` into pieces of at most {@link MAX_CONTENT_LENGTH} characters, at the last line break that fits,
 * or else at the last grapheme that fits, so an emoji such as a flag is never cut in two.
 */
function splitText(text: string): string[] {
	const pieces: string[] = [];
	let rest = text;
	while (rest.length > MAX_CONTENT_LENGTH) {
		const lineBreak = rest.lastIndexOf('\n', MAX_CONTENT_LENGTH);
		const end = lineBreak > 0 ? lineBreak : lastGraphemeBreak(rest);
		pieces.push(rest.slice(0, end));
		rest = rest.slice(lineBreak > 0 ? end + 1 : end);
	}
	pieces.push(rest);
	return pieces;
}

/**
 * Where the last grapheme that fits in {@link MAX_CONTENT_LENGTH} characters of `text` ends.
 */
function lastGraphemeBreak(text: string): number {
	let end = 0;
	for (const { index } of GRAPHEMES.segment(text)) {
		if (index > MAX_CONTENT_LENGTH) break;
		end = index;
	}
	// A single grapheme longer than a message can only be cut.
	return end > 0 ? end : MAX_CONTENT_LENGTH;
}

/**
 * Builds a {@link Message} with discord.js.
 */
function toDiscord({ buttonRows, content, files }: Message) {
	const components = buttonRows.map((row) =>
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			row.map((button) =>
				new ButtonBuilder().setCustomId(button.id).setLabel(button.label).setStyle(ButtonStyle.Primary),
			),
		),
	);
	return { components, content, files };
}
