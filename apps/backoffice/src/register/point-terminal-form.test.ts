import { pointTerminalAssignmentBodySchema } from "@purosur/contracts";
import { expect, test } from "vitest";
import {
  EMPTY_POINT_TERMINAL_FORM,
  pointTerminalFormValuesFrom,
  pointTerminalMessage,
  pointTerminalRequestFrom,
} from "./point-terminal-form";

test("fills the form with the register's terminal and the version of its assignment", () => {
  expect(
    pointTerminalFormValuesFrom({ pointTerminalId: "TERM-0042", pointTerminalVersion: 2 }),
  ).toEqual({
    terminalId: "TERM-0042",
    version: 2,
  });
});

test("fills the form empty for a register without a terminal", () => {
  expect(pointTerminalFormValuesFrom({ pointTerminalId: null, pointTerminalVersion: 0 })).toEqual(
    EMPTY_POINT_TERMINAL_FORM,
  );
});

test("builds the request with the typed terminal and the version", () => {
  const request = pointTerminalRequestFrom({ terminalId: "TERM-0042", version: 2 });

  expect(request).toEqual({ terminal_id: "TERM-0042", version: 2 });
  expect(pointTerminalAssignmentBodySchema.safeParse(request).success).toBe(true);
});

test("a typed terminal with spaces or nothing typed is refused by the request's shape", () => {
  expect(
    pointTerminalAssignmentBodySchema.safeParse(
      pointTerminalRequestFrom({ terminalId: "TERM 42", version: 0 }),
    ).success,
  ).toBe(false);
  expect(
    pointTerminalAssignmentBodySchema.safeParse(
      pointTerminalRequestFrom({ terminalId: "  ", version: 0 }),
    ).success,
  ).toBe(false);
});

test("asks for the terminal when nothing is typed", () => {
  expect(pointTerminalMessage({ terminalId: "  " })).toBe(
    "Ingresá el identificador de la terminal.",
  );
});

test("asks to remove the spaces from a typed terminal", () => {
  expect(pointTerminalMessage({ terminalId: "TERM 42" })).toBe(
    "El identificador de la terminal no puede tener espacios.",
  );
});
