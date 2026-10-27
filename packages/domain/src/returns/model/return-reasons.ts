export const RETURN_REASONS = ["change_of_mind", "defective"] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_DISPOSITIONS = ["restock", "discard"] as const;

export type ReturnDisposition = (typeof RETURN_DISPOSITIONS)[number];

export const TICKET_SOURCES = ["QR", "TYPED"] as const;

export type TicketSource = (typeof TICKET_SOURCES)[number];
