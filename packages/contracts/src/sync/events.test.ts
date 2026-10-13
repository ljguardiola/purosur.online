import { PRE_EMISSION_GATE_FAILURE_REASONS, PUSH_BATCH_MAX_EVENTS } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import {
  MALFORMED_BATTERY_REPORT,
  pushEventsRequestSchema,
  pushEventsResponseSchema,
} from "./events.js";

const event = {
  event_id: "0199b7a0-0000-7000-8000-000000000001",
  device_seq: 1,
  aggregate_type: "Sale",
  aggregate_id: "0199b7a0-0000-7000-8000-000000000002",
  event_type: "sale_opened",
  schema_version: 1,
  payload: { lines: [{ product_id: "p1", quantity: 2 }], note: null, paid: false },
  occurred_at: "2026-09-30T12:00:00.000Z",
  actor_id: "user-1",
  chain_hmac: "ab12",
};

const telemetry = { wal_size_bytes: 4096, disk_free_bytes: 5_000_000, disk_free_ratio: 0.42 };

const request = { app_version: "1.4.0", telemetry, events: [event] };

function requestWith(overrides: Record<string, unknown>) {
  return pushEventsRequestSchema.safeParse({ ...request, ...overrides });
}

function requestWithEvent(overrides: Record<string, unknown>) {
  return requestWith({ events: [{ ...event, ...overrides }] });
}

describe("push events request", () => {
  it("accepts a batch of events with the register's telemetry", () => {
    expect(pushEventsRequestSchema.parse(request)).toEqual(request);
  });

  it("accepts a full batch and refuses one more event", () => {
    const events = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ ...event, device_seq: index + 1 }));

    expect(requestWith({ events: events(PUSH_BATCH_MAX_EVENTS) }).success).toBe(true);
    expect(requestWith({ events: events(PUSH_BATCH_MAX_EVENTS + 1) }).success).toBe(false);
  });

  it("reads an event_id whose version and variant digits are unusual in lower case", () => {
    const result = requestWithEvent({ event_id: "0123ABCD-EF01-0567-F9AB-CDEF01234567" });

    expect(result.data?.events[0]?.event_id).toBe("0123abcd-ef01-0567-f9ab-cdef01234567");
  });

  it("accepts a push of no events, which only reports the register's version and telemetry", () => {
    expect(requestWith({ events: [] }).success).toBe(true);
  });

  it("refuses a missing or empty app version", () => {
    expect(requestWith({ app_version: "" }).success).toBe(false);
    expect(pushEventsRequestSchema.safeParse({ telemetry, events: [event] }).success).toBe(false);
  });

  it.each([
    ["negative wal size", { wal_size_bytes: -1 }],
    ["fractional wal size", { wal_size_bytes: 1.5 }],
    ["negative free disk", { disk_free_bytes: -1 }],
    ["fractional free disk", { disk_free_bytes: 0.5 }],
    ["free disk ratio below 0", { disk_free_ratio: -0.01 }],
    ["free disk ratio above 1", { disk_free_ratio: 1.01 }],
  ])("refuses telemetry with a %s", (_name, change) => {
    expect(requestWith({ telemetry: { ...telemetry, ...change } }).success).toBe(false);
  });

  it("accepts a register that reports it can sell", () => {
    const reported = { ...telemetry, sales_denied: false };

    expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
  });

  it("accepts a register that reports it can't sell because its event history is broken", () => {
    const reported = {
      ...telemetry,
      sales_denied: true,
      sales_denied_reason: "event_history_broken",
    };

    expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
  });

  it("accepts a register that reports it can't sell because its local database is damaged", () => {
    const reported = {
      ...telemetry,
      sales_denied: true,
      sales_denied_reason: "local_database_damaged",
    };

    expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
  });

  it.each([
    ["can't sell with no reason", { sales_denied: true }],
    [
      "can't sell for a reason the register does not report",
      { sales_denied: true, sales_denied_reason: "installation_revoked" },
    ],
    [
      "can sell with a reason",
      { sales_denied: false, sales_denied_reason: "event_history_broken" },
    ],
    ["a reason with no word on selling", { sales_denied_reason: "event_history_broken" }],
    ["a sales_denied that is not a boolean", { sales_denied: "yes" }],
  ])("refuses telemetry that says %s", (_name, change) => {
    expect(requestWith({ telemetry: { ...telemetry, ...change } }).success).toBe(false);
  });

  it("accepts a register that reports its fiscal emission available", () => {
    const reported = { ...telemetry, fiscal_emission_stopped: false };

    expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
  });

  it.each(PRE_EMISSION_GATE_FAILURE_REASONS)(
    "accepts a register that reports its fiscal emission stopped because of %s",
    (reason) => {
      const reported = {
        ...telemetry,
        fiscal_emission_stopped: true,
        fiscal_emission_stopped_reason: reason,
      };

      expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
    },
  );

  it("accepts a fiscal emission report beside every kind of sales state", () => {
    const salesStates = [
      {},
      { sales_denied: false },
      { sales_denied: true, sales_denied_reason: "event_history_broken" },
    ];
    const emissionStates = [
      { fiscal_emission_stopped: false },
      { fiscal_emission_stopped: true, fiscal_emission_stopped_reason: "legal_name_missing" },
    ];

    for (const sales of salesStates) {
      for (const emission of emissionStates) {
        const reported = { ...telemetry, ...sales, ...emission };

        expect(requestWith({ telemetry: reported }).data?.telemetry).toEqual(reported);
      }
    }
  });

  it.each([
    ["its fiscal emission is stopped with no reason", { fiscal_emission_stopped: true }],
    [
      "its fiscal emission is stopped for a reason the pre-emission check does not fail for",
      { fiscal_emission_stopped: true, fiscal_emission_stopped_reason: "out_of_paper" },
    ],
    [
      "its fiscal emission is available with a reason",
      { fiscal_emission_stopped: false, fiscal_emission_stopped_reason: "legal_name_missing" },
    ],
    [
      "a fiscal emission reason with no word on the emission",
      { fiscal_emission_stopped_reason: "legal_name_missing" },
    ],
    ["a fiscal_emission_stopped that is not a boolean", { fiscal_emission_stopped: "yes" }],
  ])("refuses telemetry that says %s", (_name, change) => {
    expect(requestWith({ telemetry: { ...telemetry, ...change } }).success).toBe(false);
  });

  it("refuses a fiscal emission report beside a sales state it refuses", () => {
    expect(
      requestWith({
        telemetry: {
          ...telemetry,
          fiscal_emission_stopped: false,
          sales_denied: true,
        },
      }).success,
    ).toBe(false);
  });

  it("accepts telemetry at its limits", () => {
    const empty = { wal_size_bytes: 0, disk_free_bytes: 0, disk_free_ratio: 0 };
    const full = { ...empty, disk_free_ratio: 1 };

    expect(requestWith({ telemetry: empty }).success).toBe(true);
    expect(requestWith({ telemetry: full }).success).toBe(true);
  });

  describe("serial devices report", () => {
    const serialDevices = {
      scale: { standing: "matching", vendor_id: "0403", product_id: "6001" },
      reader: { standing: "not_detected", vendor_id: "05e0", product_id: "1200" },
    };

    function withSerialDevices(serial_devices: unknown, extra: Record<string, unknown> = {}) {
      return requestWith({ telemetry: { ...telemetry, ...extra, serial_devices } });
    }

    it("accepts a report of both devices alongside every kind of sales state", () => {
      const states = [
        {},
        { sales_denied: false },
        { sales_denied: true, sales_denied_reason: "event_history_broken" },
      ];

      for (const state of states) {
        expect(withSerialDevices(serialDevices, state).data?.telemetry.serial_devices).toEqual(
          serialDevices,
        );
      }
    });

    it("accepts a device without an identity when it is not registered or unknown", () => {
      const report = {
        scale: { standing: "not_registered" },
        reader: { standing: "unknown" },
      };

      expect(withSerialDevices(report).data?.telemetry.serial_devices).toEqual(report);
    });

    it("still accepts telemetry without a serial devices report", () => {
      expect(requestWith({}).success).toBe(true);
    });

    it.each([
      [
        "a standing it does not know",
        { scale: { standing: "plugged" }, reader: serialDevices.reader },
      ],
      ["a missing role", { scale: serialDevices.scale }],
      ["a role it does not know", { ...serialDevices, printer: { standing: "unknown" } }],
      [
        "a vendor id without a product id",
        { ...serialDevices, scale: { standing: "matching", vendor_id: "0403" } },
      ],
      [
        "a product id without a vendor id",
        { ...serialDevices, scale: { standing: "matching", product_id: "6001" } },
      ],
      [
        "an empty vendor id",
        { ...serialDevices, scale: { standing: "matching", vendor_id: "", product_id: "6001" } },
      ],
      [
        "a vendor id that is not four lowercase hex digits",
        {
          ...serialDevices,
          scale: { standing: "matching", vendor_id: "0X03", product_id: "6001" },
        },
      ],
      [
        "a product id that is not four lowercase hex digits",
        { ...serialDevices, reader: { standing: "matching", vendor_id: "05e0", product_id: "12" } },
      ],
    ])("refuses a report with %s", (_name, report) => {
      expect(withSerialDevices(report).success).toBe(false);
    });
  });

  describe("battery report", () => {
    const present = {
      present: true,
      charge_percent: 42,
      health_percent: 88,
      on_battery: true,
      on_battery_minutes: 7,
    };

    function withBattery(battery: unknown) {
      return requestWith({ telemetry: { ...telemetry, battery } });
    }

    it("passes a present battery through", () => {
      expect(withBattery(present).data?.telemetry.battery).toEqual(present);
    });

    it("passes a present battery whose health is unknown through", () => {
      const { health_percent: _omitted, ...withoutHealth } = present;

      expect(withBattery(withoutHealth).data?.telemetry.battery).toEqual(withoutHealth);
    });

    it("passes a pack above its design capacity and one at its charge limits through", () => {
      for (const extreme of [
        { ...present, charge_percent: 0, on_battery_minutes: 0 },
        { ...present, charge_percent: 100, health_percent: 130, on_battery: false },
      ]) {
        expect(withBattery(extreme).data?.telemetry.battery).toEqual(extreme);
      }
    });

    it("passes an absent battery through", () => {
      expect(withBattery({ present: false }).data?.telemetry.battery).toEqual({ present: false });
    });

    it("leaves a push without a battery report without one", () => {
      const parsed = requestWith({});

      expect(parsed.success).toBe(true);
      expect(parsed.data?.telemetry.battery).toBeUndefined();
    });

    it.each([
      ["a charge above 100", { ...present, charge_percent: 150 }],
      ["a negative charge", { ...present, charge_percent: -1 }],
      ["a fractional charge", { ...present, charge_percent: 50.5 }],
      ["a negative health", { ...present, health_percent: -1 }],
      ["a negative time on battery", { ...present, on_battery_minutes: -1 }],
      ["a charge of the wrong type", { ...present, charge_percent: "42" }],
      ["a missing charge", { present: true, on_battery: true, on_battery_minutes: 0 }],
      ["an extra key", { ...present, voltage: 12 }],
      ["an absent battery with measures", { present: false, charge_percent: 10 }],
      ["null", null],
      ["a string", "full"],
      ["an empty object", {}],
    ])("marks a report with %s as malformed and still accepts the push", (_name, battery) => {
      const parsed = withBattery(battery);

      expect(parsed.success).toBe(true);
      expect(parsed.data?.telemetry.battery).toBe(MALFORMED_BATTERY_REPORT);
      expect(parsed.data?.telemetry.wal_size_bytes).toBe(telemetry.wal_size_bytes);
      expect(parsed.data?.events).toHaveLength(1);
    });
  });

  it.each([
    ["an event_id that is not a uuid", { event_id: "not-a-uuid" }],
    ["a zero device_seq", { device_seq: 0 }],
    ["a fractional device_seq", { device_seq: 1.5 }],
    ["a device_seq beyond the safe integers", { device_seq: Number.MAX_SAFE_INTEGER + 1 }],
    ["an empty aggregate_type", { aggregate_type: "" }],
    ["an empty aggregate_id", { aggregate_id: "" }],
    ["an empty event_type", { event_type: "" }],
    ["a zero schema_version", { schema_version: 0 }],
    ["a payload that is not an object", { payload: [1] }],
    ["a payload with a non-integer number", { payload: { amount: 1.5 } }],
    ["an occurred_at that is not a datetime", { occurred_at: "yesterday" }],
    ["an empty actor_id", { actor_id: "" }],
    ["an empty chain_hmac", { chain_hmac: "" }],
  ])("refuses an event with %s", (_name, change) => {
    expect(requestWithEvent(change).success).toBe(false);
  });

  it("refuses an event missing one of its fields", () => {
    const { chain_hmac: _omitted, ...withoutHmac } = event;

    expect(requestWith({ events: [withoutHmac] }).success).toBe(false);
  });

  it("keeps nested payload values as sent", () => {
    const payload = { a: { b: [1, "x", true, null, { c: 2 }] } };

    expect(requestWithEvent({ payload }).data?.events[0]?.payload).toEqual(payload);
  });
});

describe("push events response", () => {
  it.each([
    [{ status: "ok", ack_seq: 0 }],
    [{ status: "ok", ack_seq: 7 }],
    [{ status: "expected_seq", ack_seq: 2, expected_seq: 3 }],
    [{ status: "stale_device", ack_seq: 9 }],
    [{ status: "update_required", ack_seq: 4 }],
  ])("accepts %j", (body) => {
    expect(pushEventsResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    [{ status: "ok" }],
    [{ status: "ok", ack_seq: -1 }],
    [{ status: "ok", ack_seq: 1.5 }],
    [{ status: "expected_seq", ack_seq: 2 }],
    [{ status: "expected_seq", ack_seq: 2, expected_seq: 0 }],
    [{ status: "stale_device" }],
    [{ status: "update_required" }],
    [{ status: "update_required", ack_seq: -1 }],
    [{ status: "revoked", ack_seq: 1 }],
    [{ ack_seq: 1 }],
  ])("refuses %j", (body) => {
    expect(pushEventsResponseSchema.safeParse(body).success).toBe(false);
  });
});
