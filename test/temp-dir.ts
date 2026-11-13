/**
 * A fresh temporary directory for one test.
 */

import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Creates an empty directory under the OS temporary directory and returns its path.
 */
export function tempDir(): Promise<string> {
	return mkdtemp(join(tmpdir(), 'quest-calendars-bot-'));
}
