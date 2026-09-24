// Shared by every Administrator-only backoffice route (issue #247: only an Administrator may
// create or list a branch's users for now; a wider permission model arrives with a later Roles
// issue).
export const FORBIDDEN_RESPONSE = {
  code: "forbidden",
  message: "only an Administrator may do this",
} as const;
