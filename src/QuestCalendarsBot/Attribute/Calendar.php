<?php

declare(strict_types=1);

namespace QuestCalendarsBot\Attribute;

/**
 * Declare a class as a calendar.
 */
#[\Attribute(\Attribute::TARGET_CLASS)]
class Calendar
{
    /**
     * Constructs a Calendar attribute.
     *
     * @public string $id
     *   The calendar ID.
     * @public string $name
     *   The name of the calendar.
     * @public string $author
     *   The author of the calendar.
     * @public string $description
     *   A short description of the calendar.
     * @public string $image
     *   The URL of the calendar image.
     */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $author,
        public readonly string $description,
        public readonly string $image,
    ) {
    }
}
