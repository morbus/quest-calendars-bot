<?php

declare(strict_types=1);

namespace QuestCalendarsBot\Addon\Core\Calendar;

use QuestCalendarsBot\Attribute\Calendar;
use QuestCalendarsBot\Contract\CalendarInterface;

/**
 * Start your daily quest.
 */
#[Calendar(
    id: 'cartographers-quest',
    name: "Cartographer's Quest",
    author: 'Sundial Games',
    description: '@TODO',
    image: '@TODO',
)]
class CartographersQuestCalendar implements CalendarInterface
{
}
