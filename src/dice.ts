/**
 * The dice production rolls with.
 */

import { randomInt } from 'node:crypto';
import type { Dice } from './game.ts';

/**
 * Dice that roll uniformly at random.
 */
export const randomDice: Dice = {
	roll(sides) {
		return randomInt(1, sides + 1);
	},
};
