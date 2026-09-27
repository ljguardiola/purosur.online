import { describe, expect, test } from "vitest";
import { retryAfterDetail } from "./retryAfterDetail";

describe("retryAfterDetail", () => {
  test("rounds the wait up to whole minutes", () => {
    expect(retryAfterDetail(61)).toBe("Se puede volver a intentar en 2 minutos.");
    expect(retryAfterDetail(120)).toBe("Se puede volver a intentar en 2 minutos.");
  });

  test("names a single minute in the singular", () => {
    expect(retryAfterDetail(1)).toBe("Se puede volver a intentar en 1 minuto.");
    expect(retryAfterDetail(60)).toBe("Se puede volver a intentar en 1 minuto.");
  });
});
