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
		started TEXT NOT NULL,
		last_played TEXT,
		pages_played INTEGER NOT NULL,
		backlog_count INTEGER NOT NULL,
		backlog_updated TEXT NOT NULL,
		PRIMARY KEY (player_id, quest_id)
	) STRICT;
	CREATE TABLE player_sheets (
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
	 * How many Pages the Player can play now, at most 14.
	 */
	backlogCount: number;

	/**
	 * The Game Day the Backlog was last brought up to date, such as "2026-11-13".
	 */
	backlogUpdated: string;

	/**
	 * The id of the Character the Player picked.
	 */
	characterId: string;

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
	 * The Player's Sheet in the Quest.
	 */
	sheet: Sheet;

	/**
	 * When the Player started the Quest, as a UTC timestamp such as "2026-11-13T09:00:00.000Z".
	 */
	started: string;
};

/**
 * A {@link PlayerQuest} as {@link Storage.playerQuest} reads it, with its Sheet's Stats, Traits, and Abilities as JSON,
 * or `null` when the Quest has no Sheet.
 */
type PlayerQuestRow = {
	/**
	 * The Sheet's Abilities, as JSON.
	 */
	abilities: string | null;

	/**
	 * How many Pages the Player can play now.
	 */
	backlog_count: number;

	/**
	 * The Game Day the Backlog was last brought up to date.
	 */
	backlog_updated: string;

	/**
	 * The id of the Character the Player picked.
	 */
	character_id: string;

	/**
	 * When the Player last played a Page, or `null` before their first.
	 */
	last_played: string | null;

	/**
	 * How many Pages the Player has played.
	 */
	pages_played: number;

	/**
	 * When the Player started the Quest.
	 */
	started: string;

	/**
	 * The Sheet's Stats, as JSON.
	 */
	stats: string | null;

	/**
	 * The Sheet's Traits, as JSON.
	 */
	traits: string | null;
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
	 *
	 * @throws When the game state is damaged: they are playing it but it has no Sheet,
	 * or they aren't playing it but its Sheet was left behind.
	 */
	playerQuest(playerId: string, questId: string): PlayerQuest | undefined;

	/**
	 * Records that the Player with Discord user ID `playerId` started `playerQuest`.
	 * Call it inside {@link Storage.transaction}, so the Quest and its Sheet are written together.
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
 * The error for game state damaged outside the bot, such as a row deleted by hand,
 * naming the Player, the Quest, and what `problem` was found.
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

	// Writing the version number, even unchanged, means a file that isn't a database, or can't be
	// written to, fails here instead of on the first command. The lock keeps another process
	// from migrating between the read and the write.
	db.exec('BEGIN IMMEDIATE');
	try {
		const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
		if (version > MIGRATIONS.length) {
			throw new Error(
				`Game state has schema version ${version}, from a newer version of the bot: run that version, or restore a copy of this file from before it ran`,
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
					`SELECT character_id, started, last_played, pages_played, backlog_count, backlog_updated, stats, traits, abilities
					FROM player_quests LEFT JOIN player_sheets USING (player_id, quest_id)
					WHERE player_id = ? AND quest_id = ?`,
				)
				.get(playerId, questId) as PlayerQuestRow | undefined;
			// startQuest writes both in one transaction, so a Quest without its Sheet, or a Sheet
			// without its Quest, means the game state was damaged.
			if (row === undefined) {
				const leftoverSheet = db
					.prepare('SELECT 1 FROM player_sheets WHERE player_id = ? AND quest_id = ?')
					.get(playerId, questId);
				if (leftoverSheet !== undefined) throw damaged(playerId, questId, 'Sheet has no Quest');
				return undefined;
			}
			if (row.stats === null || row.traits === null || row.abilities === null) {
				throw damaged(playerId, questId, 'Quest has no Sheet');
			}
			return {
				backlogCount: row.backlog_count,
				backlogUpdated: row.backlog_updated,
				characterId: row.character_id,
				lastPlayed: row.last_played,
				pagesPlayed: row.pages_played,
				questId,
				sheet: {
					abilities: JSON.parse(row.abilities),
					stats: JSON.parse(row.stats),
					traits: JSON.parse(row.traits),
				},
				started: row.started,
			};
		},
		startQuest(
			playerId,
			{ backlogCount, backlogUpdated, characterId, lastPlayed, pagesPlayed, questId, sheet, started },
		) {
			db.prepare(
				`INSERT INTO player_quests
				(player_id, quest_id, character_id, started, last_played, pages_played, backlog_count, backlog_updated)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(playerId, questId, characterId, started, lastPlayed, pagesPlayed, backlogCount, backlogUpdated);
			db.prepare(
				'INSERT INTO player_sheets (player_id, quest_id, stats, traits, abilities) VALUES (?, ?, ?, ?, ?)',
			).run(
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
