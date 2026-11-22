const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Voting has its own clock; application intake still closes at event start.
export function presentationVotingWindow(event: { ends_at: string | null; starts_at: string | null }, now = Date.now()) {
 const end = Date.parse(event.ends_at || event.starts_at || '');
 const votingClosesAt = Number.isFinite(end) ? new Date(end + WEEK_MS).toISOString() : null;
 return { votingClosesAt, votingClosed: votingClosesAt === null || Date.parse(votingClosesAt) <= now };
}
