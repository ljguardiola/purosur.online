// Every id column in `schema.ts` is a Postgres `uuid`; a request id is checked against this before
// it reaches a query, since Postgres rejects a malformed one with a cast error instead of no rows.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
