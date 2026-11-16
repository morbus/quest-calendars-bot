/**
 * SQLite persistence, keyed by Discord user ID.
 */

import { DatabaseSync } from 'node:sqlite';
import type { Ability, Stats, Traits } from './builder.ts';

/**
 * How long to wait for another writer on the same file before failing.
 *
 * @remarks
 * The wait blocks the whole bot, so keep it short enough that a command
 * queued behind one wait still answers within Discord's 3-second window.
 * A second command queued behind the same lock can still miss it.
 */
const BUSY_TIMEOUT_MS = 2000;

/**
 * The schema changes, in order. Opening a database runs those it hasn't had yet,
 * and its `user_version` counts those it has. Add new ones at the end; never change one.
 */
const MIGRATIONS = [
	`CREATE TABLE player_quests (
		player_id TEXT NOT NULL,
		quest_id TEXT NOT NULL,
		character_id TEXT NOT NULL,
		start_game_day TEXT NOT NULL,
		PRIMARY KEY (player_id, quest_id)
	) STRICT;
	CREATE TABLE sheets (
		player_id TEXT NOT NULL,
		quest_id TEXT NOT NULL,
		stats TEXT NOT NULL,
		traits TEXT NOT NULL,
		abilities TEXT NOT NULL,
		PRIMARY KEY (player_id, quest_id),
		FOREIGN KEY (player_id, quest_id) REFERENCES player_quests ON DELETE CASCADE
	) STRICT;`,
];

/**
 * A Quest a Player is playing.
 */
export type PlayerQuest = {
	/**
	 * The id of the Character the Player picked.
	 */
	characterId: string;

	/**
	 * The Quest's id.
	 */
	questId: string;

	/**
	 * The Player's Sheet in the Quest.
	 */
	sheet: Sheet;

	/**
	 * The Game Day the Player started the Quest, such as "2026-11-13".
	 */
	startGameDay: string;
};

/**
 * A {@link PlayerQuest} as {@link Storage.playerQuest} reads it, with its Sheet's Stats, Traits, and Abilities as JSON.
 */
type PlayerQuestRow = {
	/**
	 * The Sheet's Abilities, as JSON.
	 */
	abilities: string;

	/**
	 * The id of the Character the Player picked.
	 */
	character_id: string;

	/**
	 * The Game Day the Player started the Quest, such as "2026-11-13".
	 */
	start_game_day: string;

	/**
	 * The Sheet's Stats, as JSON.
	 */
	stats: string;

	/**
	 * The Sheet's Traits, as JSON.
	 */
	traits: string;
};

/**
 * The current state of one Player's Character in one Quest.
 */
export type Sheet = {
	/**
	 * The Abilities, in the order Players see them.
	 */
	abilities: Ability[];

	/**
	 * The Stats.
	 */
	stats: Stats;

	/**
	 * The Traits.
	 */
	traits: Traits;
};

/**
 * Reads and writes the game state in SQLite; open it with {@link openStorage}.
 */
export type Storage = {
	/**
	 * The Quest with id `questId` that the Player with Discord user ID `playerId` is playing, if they are.
	 */
	playerQuest(playerId: string, questId: string): PlayerQuest | undefined;

	/**
	 * Records that the Player with Discord user ID `playerId` started `playerQuest`.
	 *
	 * @throws When they are already playing it.
	 */
	startQuest(playerId: string, playerQuest: PlayerQuest): void;

	/**
	 * Runs `work` in one transaction, rolling it back if `work` throws.
	 */
	transaction<T>(work: () => T): T;
};

/**
 * Opens the SQLite file at `path`, creating it if needed, and brings its schema up to date.
 *
 * @throws When the file can't be opened or written to, or isn't a SQLite database.
 */
export function openStorage(path: string): Storage {
	// Wait for another writer on the same file (an overlapping restart) instead of failing at once.
	const db = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });

	// Writing the version number, even unchanged, means a file that isn't a database, or can't be
	// written to, fails here instead of on the first command. The lock keeps another process
	// from migrating between the read and the write.
	db.exec('BEGIN IMMEDIATE');
	try {
		const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
		if (version > MIGRATIONS.length) {
			throw new Error(
				`Game state has schema version ${version}, from a newer version of the bot: run that version, or restore a backup this version made`,
			);
		}
		for (const migration of MIGRATIONS.slice(version)) db.exec(migration);
		db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
		db.exec('COMMIT');
	} catch (error) {
		if (db.isTransaction) db.exec('ROLLBACK');
		throw error;
	}

	return {
		playerQuest(playerId, questId) {
			const row = db
				.prepare(
					`SELECT character_id, start_game_day, stats, traits, abilities
					FROM player_quests JOIN sheets USING (player_id, quest_id)
					WHERE player_id = ? AND quest_id = ?`,
				)
				.get(playerId, questId) as PlayerQuestRow | undefined;
			if (row === undefined) return undefined;
			return {
				characterId: row.character_id,
				questId,
				sheet: {
					abilities: JSON.parse(row.abilities),
					stats: JSON.parse(row.stats),
					traits: JSON.parse(row.traits),
				},
				startGameDay: row.start_game_day,
			};
		},
		startQuest(playerId, { characterId, questId, sheet, startGameDay }) {
			db.prepare(
				'INSERT INTO player_quests (player_id, quest_id, character_id, start_game_day) VALUES (?, ?, ?, ?)',
			).run(playerId, questId, characterId, startGameDay);
			db.prepare('INSERT INTO sheets (player_id, quest_id, stats, traits, abilities) VALUES (?, ?, ?, ?, ?)').run(
				playerId,
				questId,
				JSON.stringify(sheet.stats),
				JSON.stringify(sheet.traits),
				JSON.stringify(sheet.abilities),
			);
		},
		transaction(work) {
			db.exec('BEGIN IMMEDIATE');
			try {
				const result = work();
				db.exec('COMMIT');
				return result;
			} catch (error) {
				db.exec('ROLLBACK');
				throw error;
			}
		},
	};
}
