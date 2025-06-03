<?php

declare(strict_types=1);

namespace QuestCalendarsBot\Addon\Core\Calendar;

use QuestCalendarsBot\Attribute\Calendar;
use QuestCalendarsBot\Contract\CalendarInterface;

/**
 * Start your daily quest.
 */
#[Calendar(
    id: 'adventures-of-sd247',
    name: 'Adventures of SD-247',
    author: 'Sundial Games',
    description: '@TODO',
    image: '@TODO',
)]
class AdventuresOfSD247Calendar implements CalendarInterface
{
}
