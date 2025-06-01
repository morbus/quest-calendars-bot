<?php

declare(strict_types=1);

namespace QuestCalendarsBot;

use Discord\Discord;
use Doctrine\ORM\EntityManagerInterface;

/**
 * The QuestCalendarsBot implementation of the Discord client class.
 */
class QuestCalendarsBot extends Discord
{
    /**
     * Directories where addons are located.
     *
     * @var string[]
     */
    public array $addonDirs = [];

    /**
     * Known assets sorted by their attribute.
     *
     * @var array<0|class-string, array<0|class-string, ?object>>
     */
    public array $assets = [];

    /**
     * The Doctrine ORM entity manager.
     */
    public EntityManagerInterface $entityManager;

    /**
     * Creates a QuestCalendarsBot client instance.
     *
     * - <multiple>: All options available on the Discord\Discord class
     * - addonDirs: An array of directories where addons are located
     * - doctrine: The configured Doctrine ORM entity manager.
     *
     * @param array<string, mixed> $options An array of options
     *
     * @throws \Discord\Exceptions\IntentException
     */
    public function __construct(array $options = [])
    {
        $this->addonDirs = $options['addonDirs'] ?? [];
        $this->entityManager = $options['doctrine'];

        // Defaults.
        // Last checked 2025-06-01.
        // @see Discord\Discord::resolveOptions()
        $discordOptions = array_intersect_key($options, array_flip([
            'token',
            'shardId',
            'shardCount',
            'loop',
            'logger',
            'loadAllMembers',
            'disabledEvents',
            'storeMessages',
            'retrieveBans',
            'intents',
            'socket_options',
            'dnsConfig',
            'cache',
        ]));

        parent::__construct($discordOptions);
    }

    /**
     * Find and load assets in our addon directories.
     */
    public function loadAddons(): void
    {
    }
}
