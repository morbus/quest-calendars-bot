<?php

declare(strict_types=1);

namespace QuestCalendarsBot;

/**
 * Provides code to be eyeballed with suspicion for refactoring.
 */
class Utilities
{
    /**
     * Turn a multiline indented string into a normal lookin' one-liner.
     */
    public static function oneLine(string $string): string
    {
        return trim((string) preg_replace('/(?:\n(?:\s*))+/m', ' ', $string));
    }
}
