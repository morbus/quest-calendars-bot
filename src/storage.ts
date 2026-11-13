/**
 * SQLite persistence, keyed by Discord user ID.
 */

import { DatabaseSync } from 'node:sqlite';

/**
 * Reads and writes the game state in SQLite; open it with {@link openStorage}.
 */
export type Storage = {
	/**
	 * Runs `work` in one transaction, rolling it back if `work` throws.
	 */
	transaction<T>(work: () => T): T;
};

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
 * Opens the SQLite file at `path`, creating it if needed.
 *
 * @throws When the file can't be opened or written to, or isn't a SQLite database.
 */
export function openStorage(path: string): Storage {
	// Wait for another writer on the same file (an overlapping restart) instead of failing at once.
	const db = new DatabaseSync(path, { timeout: BUSY_TIMEOUT_MS });
	// Opening neither reads nor writes the file, so rewrite its version number unchanged now: a file
	// that isn't a database, or can't be written to, fails here instead of on the first command.
	const { user_version: version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	db.exec(`PRAGMA user_version = ${version}`);

	return {
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
