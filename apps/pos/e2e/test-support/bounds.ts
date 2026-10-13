// Every step of a register end-to-end run takes under 3 s on CI, except the core's recovery (about
// 17 s) and the damaged database's two reports (about 31 s, a whole sync cycle). The bounds are far
// above that and only turn a wait that never ends into a failure that shows its cause.
export const WAIT_BOUND_MS = 60_000;

// The register's core syncs every 30 s; a wait that spans two of its cycles gets four.
export const SYNC_CYCLE_WAIT_BOUND_MS = 120_000;

// For a call no wait bounds, such as an evaluate against a main process that hangs: above the
// longest bound plus the longest test.
export const UNBOUNDED_CALL_BACKSTOP_MS = 240_000;
