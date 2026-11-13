/**
 * The Discord adapter: registers commands, routes them to the Game, and replies.
 */

import {
	ApplicationIntegrationType,
	Client,
	Events,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
	type ChatInputCommandInteraction,
	type InteractionEditReplyOptions,
} from 'discord.js';
import type { Game, Input, Reply } from './game.ts';
import { logger } from './log.ts';

/**
 * The slash commands, for servers and for Players who install the bot themselves.
 */
const COMMANDS = [
	new SlashCommandBuilder()
		.setName('quest')
		.setDescription('Play your quests.')
		.addSubcommand((subcommand) => subcommand.setName('start').setDescription('Start a new quest.')),
].map((builder) =>
	builder
		.setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
		.setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
		.toJSON(),
);

/**
 * Logs in to Discord, registers the slash commands, and hands every slash command to the Game.
 *
 * @throws When the login fails.
 */
export async function startBot({ game, token }: { game: Game; token: string }): Promise<Client> {
	const client = new Client({ intents: [] });

	client.once(Events.ClientReady, async (ready) => {
		logger.info('Logged in to Discord', { as: ready.user.tag });
		try {
			// Registering globally replaces whatever was registered before.
			await ready.application.commands.set(COMMANDS);
			logger.info('Registered global commands', { commands: COMMANDS.map((command) => `/${command.name}`) });
		} catch (error) {
			logger.error('Could not register commands', error);
		}
	});
	client.on(Events.Error, (error) => logger.error('Discord client error', error));
	client.on(Events.InteractionCreate, async (interaction) => {
		if (interaction.isChatInputCommand()) await handle(interaction, game);
	});

	await client.login(token);
	return client;
}

/**
 * Runs one slash command through the Game and replies only to the Player who ran it.
 */
async function handle(interaction: ChatInputCommandInteraction, game: Game): Promise<void> {
	const playerId = interaction.user.id;
	const command = [interaction.commandName, interaction.options.getSubcommand(false)].filter(Boolean).join(' ');
	const log = logger.child({ command: `/${command}`, playerId, serverId: interaction.guildId });
	let reply: Reply;
	try {
		// Acknowledge before the Game commits anything, so a missed response
		// window can't leave a committed command whose reply never arrives.
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		({ reply } = game.handle(playerId, interaction.guildId, toInput(command), new Date()));
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
 * Turns a slash command's full name, such as "quest start", into the Game's {@link Input}.
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
 * Turns a {@link Reply} into a Discord message, with a blank line between sections.
 */
function render(reply: Reply): InteractionEditReplyOptions {
	return { content: reply.sections.join('\n\n') };
}
