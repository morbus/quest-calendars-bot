<?php

declare(strict_types=1);

namespace QuestCalendarsBot\Addon\Core;

use Discord\Builders\CommandBuilder;
use Discord\Parts\Interactions\Interaction;
use QuestCalendarsBot\Attribute\Command;
use QuestCalendarsBot\Contract\CommandInterface;
use QuestCalendarsBot\QuestCalendarsBot;

/**
 * Start your daily quest.
 */
#[Command]
class StartCommand implements CommandInterface
{
    /**
     * Return an application command built with DiscordPHP's CommandBuilder.
     */
    public function getCommandBuilder(QuestCalendarsBot $questCalendarsBot): CommandBuilder
    {
        return CommandBuilder::new()
            ->setName('start')
            ->setDescription('Start your daily quest.');
    }

    /**
     * Return the command's autocomplete suggestions.
     *
     * @return \Discord\Parts\Interactions\Command\Choice[]|null
     */
    public function autocomplete(Interaction $interaction): ?array
    {
        return null;
    }

    /**
     * Handle the command and optionally respond to the user.
     */
    public function handle(Interaction $interaction): void
    {
        // [LATER] Determine if player is on existing quest. "Start" or "Continue"?
        // [NEXT] Show paginated list of all quest calendars with "Start this quest" button.
    }
}
