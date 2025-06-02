<?php

declare(strict_types=1);

namespace QuestCalendarsBot\Contract;

use Discord\Builders\CommandBuilder;
use Discord\Parts\Interactions\Interaction;
use QuestCalendarsBot\QuestCalendarsBot;

/**
 * The interface all commands must implement.
 */
interface CommandInterface extends AssetInterface
{
    /**
     * Return an application command built with DiscordPHP's CommandBuilder.
     */
    public function getCommandBuilder(QuestCalendarsBot $questCalendarsBot): CommandBuilder;

    /**
     * Return the command's autocomplete suggestions.
     *
     * @return \Discord\Parts\Interactions\Command\Choice[]|null
     */
    public function autocomplete(Interaction $interaction): ?array;

    /**
     * Handle the command and optionally respond to the user.
     */
    public function handle(Interaction $interaction): void;
}
