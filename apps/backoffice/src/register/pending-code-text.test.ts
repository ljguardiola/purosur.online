import { expect, test } from "vitest";
import {
  pendingCodeAfter,
  pendingCodeExpiryText,
  pendingCodeIssuedText,
} from "./pending-code-text";

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

test("moves the cloud's answer forward by the seconds passed since it was read", () => {
  expect(pendingCodeAfter({ secondsSinceIssued: 240, secondsUntilExpiry: 660 }, 60)).toEqual({
    secondsSinceIssued: 300,
    secondsUntilExpiry: 600,
  });
});

test("keeps the cloud's answer as it came when no time has passed since it was read", () => {
  expect(pendingCodeAfter({ secondsSinceIssued: 240, secondsUntilExpiry: 660 }, 0)).toEqual({
    secondsSinceIssued: 240,
    secondsUntilExpiry: 660,
  });
});

test("has no pending code left once its remaining time has run out", () => {
  expect(pendingCodeAfter({ secondsSinceIssued: 870, secondsUntilExpiry: 30 }, 29)).toEqual({
    secondsSinceIssued: 899,
    secondsUntilExpiry: 1,
  });
  expect(pendingCodeAfter({ secondsSinceIssued: 870, secondsUntilExpiry: 30 }, 30)).toBeNull();
  expect(pendingCodeAfter({ secondsSinceIssued: 870, secondsUntilExpiry: 30 }, 60)).toBeNull();
});
