// Shared by every Administrator-only backoffice route: only an Administrator may manage a branch's
// users until a wider permission model exists.
export const FORBIDDEN_RESPONSE = {
  code: "forbidden",
  message: "only an Administrator may do this",
} as const;
