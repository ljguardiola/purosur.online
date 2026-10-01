import { expect, test } from "vitest";
import { pendingCodeExpiryText, pendingCodeIssuedText } from "./pending-code-text";

test("says a code issued less than a minute ago was issued just now", () => {
  expect(pendingCodeIssuedText(0)).toBe("Código emitido recién");
  expect(pendingCodeIssuedText(59)).toBe("Código emitido recién");
});

test("counts the whole minutes since the code was issued", () => {
  expect(pendingCodeIssuedText(60)).toBe("Código emitido hace 1 minuto");
  expect(pendingCodeIssuedText(299)).toBe("Código emitido hace 4 minutos");
});

test("rounds the time left up to the next whole minute", () => {
  expect(pendingCodeExpiryText(1)).toBe("Vence en 1 minuto");
  expect(pendingCodeExpiryText(60)).toBe("Vence en 1 minuto");
  expect(pendingCodeExpiryText(601)).toBe("Vence en 11 minutos");
  expect(pendingCodeExpiryText(660)).toBe("Vence en 11 minutos");
});
