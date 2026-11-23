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
	`CREATE TABLE character_sheets (
		player_id TEXT NOT NULL,
		quest_id TEXT NOT NULL,
		stats TEXT NOT NULL,
		traits TEXT NOT NULL,
		abilities TEXT NOT NULL,
		PRIMARY KEY (player_id, quest_id),
		FOREIGN KEY (player_id, quest_id) REFERENCES player_quests ON DELETE CASCADE
	) STRICT;
	CREATE TABLE player_quests (
		player_id TEXT NOT NULL,
		quest_id TEXT NOT NULL,
		character_id TEXT NOT NULL,
		started TEXT NOT NULL,
		last_played TEXT,
		pages_played INTEGER NOT NULL,
		backlog_count INTEGER NOT NULL,
		backlog_updated TEXT NOT NULL,
		PRIMARY KEY (player_id, quest_id)
	) STRICT;`,
];

/**
 * The current state of one Player's Character in one Quest.
 */
export type CharacterSheet = {
	/**
	 * The Abilities.
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
 * A Quest a Player is playing.
 */
export type PlayerQuest = {
	/**
	 * How many Pages the Player can play now, at most 14.
	 */
	backlogCount: number;

	/**
	 * When the Backlog was last updated, as a UTC timestamp such as "2026-11-13T09:00:00.000Z".
	 */
	backlogUpdated: string;

	/**
	 * The id of the Character the Player picked.
	 */
	characterId: string;

	/**
	 * The Player's Character Sheet in the Quest.
	 */
	characterSheet: CharacterSheet;

	/**
	 * When the Player last played a Page, as a UTC timestamp such as
	 * "2026-11-13T09:00:00.000Z", or `null` before they play their first.
	 */
	lastPlayed: string | null;

	/**
	 * How many Pages the Player has played.
	 */
	pagesPlayed: number;

	/**
	 * The Quest's id.
	 */
	questId: string;

	/**
	 * When the Player started the Quest, as a UTC timestamp such as "2026-11-13T09:00:00.000Z".
	 */
	started: string;
};

/**
 * Reads and writes the game state in SQLite; open it with {@link openStorage}.
 */
export type Storage = {
	/**
	 * The Quest with id `questId` that the Player with Discord user ID `playerId` is playing, if they are.
	 *
	 * @throws When the game state is damaged:
	 *   a Player is playing but has no Character Sheet, or
	 *   a Player has no Quest, but a Character Sheet was left behind.
	 */
	playerQuest(playerId: string, questId: string): PlayerQuest | undefined;

	/**
	 * Records that the Player with Discord user ID `playerId` started `playerQuest`.
	 * Call it inside {@link Storage.transaction}, so the Quest and its Character Sheet are written together.
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
 * The error for when the game state is damaged.
 */
function damaged(playerId: string, questId: string, problem: string): Error {
	return new Error(`Game state is damaged: ${playerId}'s ${questId} ${problem}`);
}

/**
 * Opens the SQLite file at `path`, creating it if needed, and brings its schema up to date.
 *
 * @throws When the file can't be opened or written to, or isn't a SQLite database.
 */
export function openStorage(path: string): Storage {
	// Wait for another writer on the same file (an overlapping restart) instead of failing at once.
	const db = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });

	/**
	 * Runs `work` in one transaction, rolling it back if `work` throws.
	 */
	function transaction<T>(work: () => T): T {
		db.exec('BEGIN IMMEDIATE');
		try {
			const result = work();
			db.exec('COMMIT');
			return result;
		} catch (error) {
			// SQLite rolls back some failures itself, and
			// a second ROLLBACK would hide the real error.
			if (db.isTransaction) db.exec('ROLLBACK');
			throw error;
		}
	}

	// Writing the version number, even unchanged, means a file that isn't a database, or can't be
	// written to, fails here instead of on the first command. The lock keeps another process
	// from migrating between the read and the write.
	transaction(() => {
		const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
		if (version > MIGRATIONS.length)
			throw new Error(`Game state is newer than expected (${version} > ${MIGRATIONS.length})`);
		for (const migration of MIGRATIONS.slice(version)) db.exec(migration);
		db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
	});

	return {
		playerQuest(playerId, questId) {
			const row = db
				.prepare(/* sql */ `
					SELECT
						character_id,
						started,
						last_played,
						pages_played,
						backlog_count,
						backlog_updated,
						stats,
						traits,
						abilities
					FROM player_quests
					LEFT JOIN character_sheets USING (player_id, quest_id)
					WHERE player_id = ? AND quest_id = ?;
				`)
				.get(playerId, questId) as
				| {
						character_id: string;
						started: string;
						last_played: string | null;
						pages_played: number;
						backlog_count: number;
						backlog_updated: string;
						stats: string | null;
						traits: string | null;
						abilities: string | null;
				  }
				| undefined;
			if (row === undefined) {
				const leftoverCharacterSheet = db
					.prepare('SELECT 1 FROM character_sheets WHERE player_id = ? AND quest_id = ?')
					.get(playerId, questId);
				if (leftoverCharacterSheet !== undefined) throw damaged(playerId, questId, 'Character Sheet has no Quest');
				return undefined;
			}
			if (row.stats === null || row.traits === null || row.abilities === null) {
				throw damaged(playerId, questId, 'Quest has no Character Sheet');
			}
			return {
				backlogCount: row.backlog_count,
				backlogUpdated: row.backlog_updated,
				characterId: row.character_id,
				characterSheet: {
					abilities: JSON.parse(row.abilities),
					stats: JSON.parse(row.stats),
					traits: JSON.parse(row.traits),
				},
				lastPlayed: row.last_played,
				pagesPlayed: row.pages_played,
				questId,
				started: row.started,
			};
		},
		startQuest(
			playerId,
			{ backlogCount, backlogUpdated, characterId, characterSheet, lastPlayed, pagesPlayed, questId, started },
		) {
			db.prepare(/* sql */ `
				INSERT INTO player_quests
					(player_id, quest_id, character_id, started, last_played, pages_played, backlog_count, backlog_updated)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?);
			`).run(playerId, questId, characterId, started, lastPlayed, pagesPlayed, backlogCount, backlogUpdated);
			db.prepare(/* sql */ `
				INSERT INTO character_sheets (player_id, quest_id, stats, traits, abilities) VALUES (?, ?, ?, ?, ?);
			`).run(
				playerId,
				questId,
				JSON.stringify(characterSheet.stats),
				JSON.stringify(characterSheet.traits),
				JSON.stringify(characterSheet.abilities),
			);
		},
		transaction,
	};
}
