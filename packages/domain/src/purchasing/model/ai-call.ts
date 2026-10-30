export const AI_CALL_PURPOSES = ["READING", "LINK_PROPOSAL"] as const;

export type AiCallPurpose = (typeof AI_CALL_PURPOSES)[number];

export const AI_CALL_OUTCOMES = ["completed", "cut_short", "failed"] as const;

export type AiCallOutcome = (typeof AI_CALL_OUTCOMES)[number];
