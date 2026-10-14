import type { LocalDatabase } from "../platform/local-database";

export function pointTerminalAssigned(database: LocalDatabase): boolean {
  const row = database
    .prepare<[], { assigned: number }>(
      `SELECT register_point_terminal.assigned AS assigned
       FROM register_point_terminal
       JOIN own_register ON own_register.id = register_point_terminal.register_id
       WHERE own_register.removed = 0`,
    )
    .get();
  return row?.assigned === 1;
}
