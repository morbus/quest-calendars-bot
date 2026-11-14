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
	type InteractionEditReplyOptions,
} from 'discord.js';
import type { Game, Input, Reply } from './game.ts';
import { logger } from './log.ts';

/**
 * The most buttons Discord shows in one row.
 */
const BUTTONS_PER_ROW = 5;

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
		await interaction.editReply(render(reply));
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
 * Turns a {@link Reply} into a Discord message, with a blank line between sections and its buttons in rows below.
 */
function render(reply: Reply): InteractionEditReplyOptions {
	const buttons = (reply.buttons ?? []).map((button) =>
		new ButtonBuilder().setCustomId(button.id).setLabel(button.label).setStyle(ButtonStyle.Primary),
	);
	const components = [];
	for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
		components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.slice(i, i + BUTTONS_PER_ROW)));
	}
	return { content: reply.sections.join('\n\n'), components };
}
