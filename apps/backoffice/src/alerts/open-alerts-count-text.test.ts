import { expect, test } from "vitest";
import { openAlertsCountText } from "./open-alerts-count-text";

test("counts one open alert in the singular and several in the plural", () => {
  expect(openAlertsCountText(1)).toBe("1 alerta abierta");
  expect(openAlertsCountText(8)).toBe("8 alertas abiertas");
});

test("writes the count in Argentine Spanish", () => {
  expect(openAlertsCountText(1234)).toBe("1.234 alertas abiertas");
});
