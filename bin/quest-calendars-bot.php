#!/usr/bin/env php
<?php

/**
 * @file
 * Set up or start the bot.
 */

declare(strict_types=1);

include __DIR__.'/../vendor/autoload.php';

use Bramus\Monolog\Formatter\ColoredLineFormatter;
use Composer\Autoload\ClassLoader;
use Discord\Parts\User\Activity;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Tools\DsnParser;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Monolog\Handler\StreamHandler;
use Monolog\Logger;
use QuestCalendarsBot\QuestCalendarsBot;

// Load the command line options.
$options = getopt('', ['help::', 'register::']);
if (isset($options['help'])) {
    exit(
        "\nExample usage:\n\n".
        '  '.mb_str_pad($_SERVER['PHP_SELF'], 30)."Start the bot normally.\n".
        '  '.mb_str_pad($_SERVER['PHP_SELF'].' --register', 30)."Register application commands.\n\n"
    );
}

// Load the .env file.
Dotenv\Dotenv::createImmutable(__DIR__.'/../')->load();

// Addons.
$addonDirs = [
    __DIR__.'/../src',
    __DIR__.'/../contrib',
    __DIR__.'/../custom',
];

// Autoload addons too.
$loader = new ClassLoader();
$loader->addPsr4('', $addonDirs);
$loader->register();

// Setup a colored Monolog logger.
$handler = new StreamHandler('php://stdout');
$handler->setFormatter(new ColoredLineFormatter());
$logger = new Logger('QuestCalendarsBot');
$logger->pushHandler($handler);

// Setup the Doctrine ORM.
$dsnParser = new DsnParser();
$dsnParsed = $dsnParser->parse($_ENV['BOT_DATABASE_DSN']);
$config = ORMSetup::createAttributeMetadataConfiguration(paths: $addonDirs);
$connection = DriverManager::getConnection($dsnParsed, $config);
$entityManager = new EntityManager($connection, $config);

// Configure the bot.
$questCalendarsBot = new QuestCalendarsBot([
    'addonDirs' => $addonDirs,
    'doctrine' => $entityManager,
    'logger' => $logger,
    'token' => $_ENV['BOT_TOKEN'],
]);

$questCalendarsBot->on('init', static function (QuestCalendarsBot $questCalendarsBot) {
    // Start the bot normally.
    if (null === $GLOBALS['options']) {
        $questCalendarsBot->loadAddons();
        $questCalendarsBot->updatePresence(new Activity($questCalendarsBot, [
            'type' => Activity::TYPE_WATCHING,
            'name' => 'for /start',
        ]));
    }
});
