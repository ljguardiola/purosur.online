import { describe, expect, it } from "vitest";
import { mercadoPagoRecordingScrubber } from "./scrub-mercado-pago-recording.js";

const secrets = {
  accessToken: "TEST-9988776655-secret-token",
  accountId: "5544332211",
  externalPosId: "REALSTORE01REALPOS01",
  terminalId: "PAX_A910__REALSERIAL77",
  externalReferences: ["7b1c3f9e-qr-reference", "4d2a8e10-point-reference"],
};

function scrub(value: unknown) {
  return mercadoPagoRecordingScrubber(secrets)(value);
}

const ORDER_ID = "ORD01KR7XQ2M9ZJ4H8P6TB3N5VWCYA";
const OTHER_ORDER_ID = "ORD01KR7XQ2M9ZJ4H8P6TB3N5VWCYB";
const PAYMENT_ID = "PAY01KR7XQ2M9ZJ4H8P6TB3N5VWCYC";

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

  describe("Mercado Pago's identifiers", () => {
    it("replaces an order's and a payment's identifier with fictional ones of the same prefix and length", () => {
      const result = scrub({ id: ORDER_ID, transactions: { payments: [{ id: PAYMENT_ID }] } });

      expect(result.value).toEqual({
        id: "ORD00000000000000000000000001",
        transactions: { payments: [{ id: "PAY00000000000000000000000002" }] },
      });
      expect(result.replacements).toEqual([{ field: "id", count: 2 }]);
    });

    it("replaces reference and transaction identifiers and numeric ones too", () => {
      const result = scrub({
        reference_id: "01KR7XQ2M9ZJ4H8P6TB3N5VWCYD",
        transaction_id: PAYMENT_ID,
        id: 76543210987,
        other: { id: "123456789" },
      });

      expect(result.value).toEqual({
        reference_id: "000000000000000000000000001",
        transaction_id: "PAY00000000000000000000000002",
        id: 10000000003,
        other: { id: "000000004" },
      });
      expect(result.replacements).toEqual([
        { field: "reference_id", count: 1 },
        { field: "transaction_id", count: 1 },
        { field: "id", count: 2 },
      ]);
    });

    it("gives the same identifier the same fictional one across every answer of one recording", () => {
      const scrubber = mercadoPagoRecordingScrubber(secrets);

      const first = scrubber({ data: [{ id: ORDER_ID }] });
      const second = scrubber({ data: [{ id: OTHER_ORDER_ID }, { id: ORDER_ID }] });

      expect(first.value).toEqual({ data: [{ id: "ORD00000000000000000000000001" }] });
      expect(second.value).toEqual({
        data: [{ id: "ORD00000000000000000000000002" }, { id: "ORD00000000000000000000000001" }],
      });
    });

    it("scrubs the same answers the same way in a new recording", () => {
      const answers = [{ data: [{ id: ORDER_ID }] }, { data: [{ id: PAYMENT_ID }] }];
      const scrubbedBy = () => answers.map(mercadoPagoRecordingScrubber(secrets));

      expect(scrubbedBy()).toEqual(scrubbedBy());
    });

    it("replaces an identifier written inside another text, even before its own field", () => {
      const result = scrub({
        message: `order ${ORDER_ID} cannot be read`,
        id: ORDER_ID,
      });

      expect(result.value).toEqual({
        message: "order ORD00000000000000000000000001 cannot be read",
        id: "ORD00000000000000000000000001",
      });
      expect(result.replacements).toEqual([{ field: "id", count: 2 }]);
    });

    it("keeps identifiers that name a kind rather than a record", () => {
      const body = { payment_method: { id: "account_money", type: "account_money" }, id: "visa" };

      expect(scrub(body)).toEqual({ value: body, replacements: [] });
    });
  });

  describe("the values the recording was made with", () => {
    it("replaces the point of sale and the terminal wherever they are written", () => {
      const result = scrub({
        config: { qr: { pos: "REALSTORE01REALPOS01" } },
        note: "queued on PAX_A910__REALSERIAL77",
      });

      expect(result.value).toEqual({
        config: { qr: { pos: "STORE01POS01" } },
        note: "queued on FICTIONAL__SMARTPOS1",
      });
      expect(result.replacements).toEqual([
        { field: "external_pos_id", count: 1 },
        { field: "terminal_id", count: 1 },
      ]);
    });

    it("replaces each external reference the recording made with a fixed fictional one", () => {
      const result = scrub({
        data: [
          { external_reference: "7b1c3f9e-qr-reference" },
          { external_reference: "4d2a8e10-point-reference" },
        ],
      });

      expect(result.value).toEqual({
        data: [
          { external_reference: "00000000-0000-4000-8000-000000000001" },
          { external_reference: "00000000-0000-4000-8000-000000000002" },
        ],
      });
      expect(result.replacements).toEqual([{ field: "external_reference", count: 2 }]);
    });
  });
});
