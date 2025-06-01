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
