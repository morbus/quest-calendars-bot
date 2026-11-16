/**
 * The calendar: which Game Day it is.
 */

/**
 * The Game Day `now` falls on in `timezone`, as its date, such as "2026-11-13".
 */
export function gameDay(now: Date, timezone: string): string {
	const format = new Intl.DateTimeFormat('en-US', {
		day: '2-digit',
		month: '2-digit',
		timeZone: timezone,
		year: 'numeric',
	});
	const parts = Object.fromEntries(format.formatToParts(now).map(({ type, value }) => [type, value]));
	return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * A Game Day, such as "2026-11-13", as Players read it, such as "November 13, 2026".
 */
export function gameDayName(day: string): string {
	return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { dateStyle: 'long', timeZone: 'UTC' });
}
