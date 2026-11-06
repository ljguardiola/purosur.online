import { describe, expect, it } from "vitest";
import { scrubMercadoPagoRecording } from "./scrub-mercado-pago-recording.js";

const secrets = { accessToken: "TEST-9988776655-secret-token", accountId: "5544332211" };

function scrub(value: unknown) {
  return scrubMercadoPagoRecording(value, secrets);
}

describe("scrubbing a Mercado Pago recording", () => {
  it("replaces every occurrence of the access token inside a string", () => {
    const result = scrub({
      a: `Bearer ${secrets.accessToken} and ${secrets.accessToken}`,
      list: [`x ${secrets.accessToken}`],
    });

    expect(result.value).toEqual({
      a: "Bearer FICTIONAL-ACCESS-TOKEN and FICTIONAL-ACCESS-TOKEN",
      list: ["x FICTIONAL-ACCESS-TOKEN"],
    });
    expect(result.replacements).toEqual([{ field: "access token", count: 3 }]);
  });

  it("replaces the account id keeping the type of the value", () => {
    const result = scrub({ owner: 5544332211, text: "5544332211", other: 77 });

    expect(result.value).toEqual({ owner: 1234567890, text: "1234567890", other: 77 });
    expect(result.replacements).toEqual([{ field: "account id", count: 2 }]);
  });

  it("replaces the account id inside a longer string only when delimited by non-digits", () => {
    const result = scrub({
      path: "/users/5544332211/orders",
      longer: "x155443322112",
    });

    expect(result.value).toEqual({
      path: "/users/1234567890/orders",
      longer: "x155443322112",
    });
    expect(result.replacements).toEqual([{ field: "account id", count: 1 }]);
  });

  it("replaces user_id and collector_id keeping a number a number", () => {
    const result = scrub({ user_id: 99, collector_id: "88", nested: { user_id: "7" } });

    expect(result.value).toEqual({
      user_id: 1234567890,
      collector_id: "1234567890",
      nested: { user_id: "1234567890" },
    });
    expect(result.replacements).toEqual([
      { field: "user_id", count: 2 },
      { field: "collector_id", count: 1 },
    ]);
  });

  it("replaces by key the point of sale, terminal, QR data and buyer details", () => {
    const result = scrub({
      external_pos_id: "REALPOS",
      terminal_id: "PAX_A910__SMARTPOS123",
      qr_data: "00020101...",
      email: "real@person.com",
      first_name: "Real",
      last_name: "Person",
      identification: { type: "DNI", number: "30111222" },
      phone: { area_code: "351", number: "5551234" },
      cardholder: { name: "REAL PERSON" },
      card_holder: { name: "REAL PERSON" },
      first_six_digits: "411111",
      last_four_digits: "1234",
    });

    expect(result.value).toEqual({
      external_pos_id: "STORE01POS01",
      terminal_id: "FICTIONAL__SMARTPOS1",
      qr_data: "FICTIONAL-QR-DATA",
      email: "comprador@example.com",
      first_name: "Nombre",
      last_name: "Apellido",
      identification: { type: "DNI", number: "12345678" },
      phone: { area_code: "11", number: "12345678" },
      cardholder: { name: "NOMBRE APELLIDO" },
      card_holder: { name: "NOMBRE APELLIDO" },
      first_six_digits: "000000",
      last_four_digits: "0000",
    });
    expect(result.replacements.map(({ field }) => field)).toEqual([
      "external_pos_id",
      "terminal_id",
      "qr_data",
      "email",
      "first_name",
      "last_name",
      "identification",
      "phone",
      "cardholder",
      "card_holder",
      "first_six_digits",
      "last_four_digits",
    ]);
  });

  it("does not walk into a value replaced by key", () => {
    const result = scrub({ identification: { number: 5544332211, inner: { user_id: 1 } } });

    expect(result.value).toEqual({ identification: { type: "DNI", number: "12345678" } });
    expect(result.replacements).toEqual([{ field: "identification", count: 1 }]);
  });

  it("leaves null values under replaced keys alone and uncounted", () => {
    const result = scrub({ email: null, user_id: null });

    expect(result.value).toEqual({ email: null, user_id: null });
    expect(result.replacements).toEqual([]);
  });

  it("walks arrays of objects", () => {
    const result = scrub({ data: [{ user_id: 1 }, { user_id: 2 }, { id: "ORD1" }] });

    expect(result.value).toEqual({
      data: [{ user_id: 1234567890 }, { user_id: 1234567890 }, { id: "ORD1" }],
    });
    expect(result.replacements).toEqual([{ field: "user_id", count: 2 }]);
  });

  it("keeps everything else exactly as received", () => {
    const body = {
      data: [
        {
          id: "ORD01",
          status: "created",
          total_amount: "10.00",
          created_date: "2026-01-01T00:00:00.000Z",
          external_reference: "ref-1",
        },
      ],
      paging: { total: 1, offset: 0 },
      errors: [{ code: "invalid_date", message: "bad date" }],
      flag: true,
      nothing: null,
    };

    const result = scrub(body);

    expect(result.value).toEqual(body);
    expect(result.replacements).toEqual([]);
  });

  it("does not change its input", () => {
    const input = { user_id: 5, list: [{ email: "a@b.c", note: secrets.accessToken }] };
    const snapshot = structuredClone(input);

    scrub(input);

    expect(input).toEqual(snapshot);
  });

  it("reports counts in order of first replacement without any value", () => {
    const result = scrub({ email: "a@b.c", user_id: 1, more: [{ email: "d@e.f" }] });

    expect(result.replacements).toEqual([
      { field: "email", count: 2 },
      { field: "user_id", count: 1 },
    ]);
    expect(JSON.stringify(result.replacements)).not.toContain("a@b.c");
  });

  it("returns a primitive root unchanged with nothing replaced", () => {
    expect(scrub("plain text")).toEqual({ value: "plain text", replacements: [] });
  });
});
