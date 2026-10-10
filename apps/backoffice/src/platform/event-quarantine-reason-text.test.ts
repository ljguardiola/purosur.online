import { expect, test } from "vitest";
import { eventQuarantineReasonText } from "./event-quarantine-reason-text";

test("says the cloud cannot read an unreadable event", () => {
  expect(eventQuarantineReasonText({ kind: "unreadable" })).toBe(
    "la nube no puede leer lo que envió la caja",
  );
});

test("names the record a missing dependency waits for", () => {
  expect(
    eventQuarantineReasonText({
      kind: "missing_dependency",
      aggregateType: "CashSession",
      aggregateId: "session-1",
    }),
  ).toBe("depende de la sesión de caja session-1, que todavía no se aplicó");
});

test("says the cloud could not save an event it could not record", () => {
  expect(eventQuarantineReasonText({ kind: "not_recorded" })).toBe("la nube no lo pudo guardar");
});
