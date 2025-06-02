
# Quest Calendars Bot

_A Discord bot to play Sundial Game's Quest Calendars._

## Installation

1. Run `composer install` to get all the PHP dependencies.
2. Copy `.env.example` to `.env`, then edit `.env` with your details.
3. To register the bot's application commands, run `composer bot:register`.
4. To start the bot, run either `composer bot` or `composer bot:start`.

## OAuth2 URL Generator

The bot needs the following scopes and permissions:

- Scopes
    - applications.commands
    - bot
- Bot Permissions
    - Text Permissions
        - Send Messages
        - Manage Messages
        - Embed Links
        - Read Message History
        - Add Reactions
        - Use Slash Commands

## Developers

1. Run `composer qa` to lint everything.

### Custom addons

In addition to the shipped assets available in `./src/QuestCalendarsBot/Addons`,
you can define your own custom assets outside of this location. To get started,
either create a directory in `./custom` and add your asset classes to it, or
specify your own (and/or additional) directories by modifying the `$addonDirs`
configuration in `bin/quest-calendars-bot.php`. Make sure the class `namespace`
maps to the directory structure and that each asset class uses one of the
following asset Attributes:

* `#[Calendar]`
* `#[Character]`
* `#[Command]`
* `#[Entity]`

Here's an example of how you'd organize and namespace custom assets:

| Location                                               | Namespace                                       |
|--------------------------------------------------------|-------------------------------------------------|
| `custom/MyGreatAddonName/SleepCommand.php`             | `namespace MyGreatAddonName`                    |
| `custom/MyGreatAddonName/Deeper/Path/WyrmCalendar.php` | `namespace MyGreatAddonName\Deeper\Path`        |
| `contrib/theirRepo/theirAddon/SnuffleCharacter.php`    | `namespace theirAddon`***<sup>1</sup>***        |

<sup>1</sup> Only possible if you add `contrib/theirRepo` to `$addonDirs`.
