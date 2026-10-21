import {
  ALERT_KINDS,
  type AlertDetails,
  type AlertKind,
  ARGENTINA_TIME_ZONE,
  OFFSITE_DUMP_UNVERIFIED_REASONS,
} from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type AlertDetail, alertDetailSchema } from "./alert-detail.js";

const delivery = {
  channel: "backoffice",
  status: "sent",
  error: null,
  createdAt: "2026-05-04T13:10:05.000Z",
  recipient: {
    id: "user-2",
    firstName: "Lucía",
    role: { id: "role-1", name: "Administrador", isAdministrator: true },
  },
};
const emailChange = {
  id: "alert-1",
  kind: "user_email_changed",
  scope: "user-1",
  scopeDisplay: "Marcela",
  scopeKind: "user",
  level: "warning",
  audience: "all",
  detail: {
    previousEmail: "a@example.com",
    newEmail: "b@example.com",
    actorId: "user-9",
    actorName: "Ada",
  },
  openedAt: "2026-05-04T13:10:00.000Z",
  escalatedAt: null,
  resolvedAt: null,
  open: true,
  closing: "by_hand",
  deliveries: [delivery],
};

describe("alertDetailSchema", () => {
  it("accepts an alert with deliveries and one without", () => {
    expect(alertDetailSchema.safeParse(emailChange).data).toEqual(emailChange);
    expect(alertDetailSchema.safeParse({ ...emailChange, deliveries: [] }).data).toEqual({
      ...emailChange,
      deliveries: [],
    });
  });

  it("accepts a closed alert without a scope and a failed delivery with its error", () => {
    const closed = {
      ...emailChange,
      scope: null,
      scopeDisplay: null,
      resolvedAt: "2026-05-04T15:10:00.000Z",
      open: false,
      escalatedAt: "2026-05-04T14:10:00.000Z",
      deliveries: [
        { ...delivery, status: "failed", error: "sin conexión" },
        {
          ...delivery,
          recipient: { ...delivery.recipient, role: { ...delivery.recipient.role, name: null } },
        },
      ],
    };

    expect(alertDetailSchema.safeParse(closed).data).toEqual(closed);
  });

  it("requires the kind of scope the alert's kind has", () => {
    const { scopeKind: _omitted, ...withoutScopeKind } = emailChange;

    expect(alertDetailSchema.safeParse(withoutScopeKind).success).toBe(false);
  });

  it("strips from a kind's detail the keys that kind does not define", () => {
    const withExtra = { ...emailChange, detail: { ...emailChange.detail, failureCount: 3 } };

    expect(alertDetailSchema.safeParse(withExtra).data).toEqual(emailChange);
  });

  it("strips keys it does not define, also inside a delivery, its recipient and its role", () => {
    expect(
      alertDetailSchema.safeParse({
        ...emailChange,
        secret: 1,
        deliveries: [
          {
            ...delivery,
            id: "delivery-1",
            recipient: {
              ...delivery.recipient,
              email: "x@example.com",
              role: { ...delivery.recipient.role, permissions: [] },
            },
          },
        ],
      }).data,
    ).toEqual(emailChange);
  });

  it.each(Object.keys(emailChange))("requires %s", (field) => {
    const { [field as keyof typeof emailChange]: _omitted, ...rest } = emailChange;

    expect(alertDetailSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ["kind", 1],
    ["kind", "user_unknown"],
    ["level", "info"],
    ["audience", "everyone"],
    ["scope", 1],
    ["scopeDisplay", undefined],
    ["detail", null],
    ["detail", []],
    ["detail", "{}"],
    ["detail", {}],
    ["openedAt", 1],
    ["escalatedAt", undefined],
    ["resolvedAt", undefined],
    ["open", "true"],
    ["open", null],
    ["closing", false],
    ["closing", "by_the_register"],
    ["closing", null],
    ["deliveries", null],
    ["deliveries", {}],
  ])("refuses %s as %j", (field, value) => {
    expect(alertDetailSchema.safeParse({ ...emailChange, [field]: value }).success).toBe(false);
  });

  it("accepts an alert that closes once its events are released", () => {
    const alert = { ...emailChange, closing: "when_its_events_are_released" };

    expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
  });

  const deliveryFields = ["channel", "status", "error", "createdAt", "recipient"];
  it.each(deliveryFields)("requires a delivery's %s", (field) => {
    const { [field as keyof typeof delivery]: _omitted, ...rest } = delivery;

    expect(alertDetailSchema.safeParse({ ...emailChange, deliveries: [rest] }).success).toBe(false);
  });

  it.each([
    ["channel", 1],
    ["status", null],
    ["error", undefined],
    ["error", 1],
    ["createdAt", 1],
    ["recipient", null],
  ])("refuses a delivery's %s as %j", (field, value) => {
    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, [field]: value }] })
        .success,
    ).toBe(false);
  });

  it("types every alert kind the domain catalogues, and none else", () => {
    expectTypeOf<AlertDetail["kind"]>().toEqualTypeOf<AlertKind>();
  });

  it("types each kind's detail as the domain stores it, plus the actor's name where one acted", () => {
    type WireDetail<Kind extends AlertKind> = Extract<AlertDetail, { kind: Kind }>["detail"];
    type Named = { actorName?: string | undefined };

    expectTypeOf<WireDetail<"backoffice_passkey_changed">>().toExtend<
      AlertDetails["backoffice_passkey_changed"]
    >();
    expectTypeOf<AlertDetails["backoffice_passkey_changed"]>().toExtend<
      WireDetail<"backoffice_passkey_changed">
    >();
    expectTypeOf<WireDetail<"user_email_changed">>().toExtend<
      AlertDetails["user_email_changed"] & Named
    >();
    expectTypeOf<AlertDetails["user_email_changed"]>().toExtend<WireDetail<"user_email_changed">>();
    expectTypeOf<WireDetail<"user_access_increased">>().toExtend<
      AlertDetails["user_access_increased"]
    >();
    expectTypeOf<AlertDetails["user_access_increased"]>().toExtend<
      WireDetail<"user_access_increased">
    >();
    expectTypeOf<WireDetail<"backoffice_recovery_requested">>().toEqualTypeOf<
      AlertDetails["backoffice_recovery_requested"]
    >();
    expectTypeOf<WireDetail<"register_enrolled">>().toEqualTypeOf<
      AlertDetails["register_enrolled"]
    >();
    expectTypeOf<WireDetail<"events_quarantined">>().toEqualTypeOf<
      AlertDetails["events_quarantined"]
    >();
    expectTypeOf<WireDetail<"event_invariant_violated">>().toEqualTypeOf<
      AlertDetails["event_invariant_violated"]
    >();
    expectTypeOf<WireDetail<"arca_certificate_expiring">>().toEqualTypeOf<
      AlertDetails["arca_certificate_expiring"]
    >();
    expectTypeOf<WireDetail<"arca_wsaa_ticket_held">>().toEqualTypeOf<
      AlertDetails["arca_wsaa_ticket_held"]
    >();
    expectTypeOf<WireDetail<"update_required">>().toEqualTypeOf<AlertDetails["update_required"]>();
    expectTypeOf<WireDetail<"register_silent">>().toEqualTypeOf<AlertDetails["register_silent"]>();
    expectTypeOf<WireDetail<"sales_denied">>().toEqualTypeOf<AlertDetails["sales_denied"]>();
    expectTypeOf<WireDetail<"fiscal_rejected">>().toEqualTypeOf<AlertDetails["fiscal_rejected"]>();
    expectTypeOf<WireDetail<"clock_corrected">>().toExtend<
      AlertDetails["clock_corrected"] & Named
    >();
    expectTypeOf<AlertDetails["clock_corrected"]>().toExtend<WireDetail<"clock_corrected">>();
    expectTypeOf<WireDetail<"external_billing">>().toEqualTypeOf<
      AlertDetails["external_billing"]
    >();
    expectTypeOf<WireDetail<"invoice_already_credited">>().toEqualTypeOf<
      AlertDetails["invoice_already_credited"]
    >();
    expectTypeOf<WireDetail<"late_payment_refund">>().toEqualTypeOf<
      AlertDetails["late_payment_refund"]
    >();
    expectTypeOf<WireDetail<"refund_task">>().toEqualTypeOf<AlertDetails["refund_task"]>();
    expectTypeOf<WireDetail<"fiscal_unknown">>().toEqualTypeOf<AlertDetails["fiscal_unknown"]>();
    expectTypeOf<WireDetail<"clock_drift">>().toEqualTypeOf<AlertDetails["clock_drift"]>();
    expectTypeOf<WireDetail<"outbox_chain_broken">>().toEqualTypeOf<
      AlertDetails["outbox_chain_broken"]
    >();
    expectTypeOf<WireDetail<"offsite_dump_unverified">>().toEqualTypeOf<
      AlertDetails["offsite_dump_unverified"]
    >();
    expectTypeOf<WireDetail<"register_backup_overdue">>().toEqualTypeOf<
      AlertDetails["register_backup_overdue"]
    >();
    expectTypeOf<Omit<WireDetail<"lots_expiring">, "aboutViewerBranch">>().toEqualTypeOf<
      AlertDetails["lots_expiring"]
    >();
    expectTypeOf<WireDetail<"lots_expiring">["aboutViewerBranch"]>().toBeBoolean();
    expectTypeOf<Omit<WireDetail<"fortnight_report_pending">, "registerName">>().toEqualTypeOf<
      AlertDetails["fortnight_report_pending"]
    >();
    expectTypeOf<Omit<WireDetail<"fortnight_report_overdue">, "registerName">>().toEqualTypeOf<
      AlertDetails["fortnight_report_overdue"]
    >();
    expectTypeOf<
      Omit<WireDetail<"fortnight_report_needs_regularization">, "registerName">
    >().toEqualTypeOf<AlertDetails["fortnight_report_needs_regularization"]>();
    expectTypeOf<WireDetail<"fortnight_report_owed_elsewhere">>().toEqualTypeOf<
      AlertDetails["fortnight_report_owed_elsewhere"]
    >();
    expectTypeOf<WireDetail<"fortnight_report_pending">["registerName"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<WireDetail<"fiscal_emission_stopped">>().toEqualTypeOf<
      AlertDetails["fiscal_emission_stopped"]
    >();
    expectTypeOf<WireDetail<"offline_authorization_code_missing">>().toExtend<
      AlertDetails["offline_authorization_code_missing"]
    >();
    expectTypeOf<
      Omit<WireDetail<"offline_authorization_code_missing">, "fortnightStarted">
    >().toEqualTypeOf<AlertDetails["offline_authorization_code_missing"]>();
    expectTypeOf<
      WireDetail<"offline_authorization_code_missing">["fortnightStarted"]
    >().toBeBoolean();
    expectTypeOf<WireDetail<"backoffice_sign_in_lockout">>().toExtend<
      Omit<AlertDetails["backoffice_sign_in_lockout"], "sourceAddress">
    >();
    expectTypeOf<Omit<AlertDetails["backoffice_sign_in_lockout"], "sourceAddress">>().toExtend<
      WireDetail<"backoffice_sign_in_lockout">
    >();
  });

  it.each(["id", "firstName", "role"])("requires a recipient's %s", (field) => {
    const { [field as keyof typeof delivery.recipient]: _omitted, ...recipient } =
      delivery.recipient;

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["id", 1],
    ["firstName", null],
    ["role", null],
  ])("refuses a recipient's %s as %j", (field, value) => {
    const recipient = { ...delivery.recipient, [field]: value };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each(["id", "name", "isAdministrator"])("requires a role's %s", (field) => {
    const { [field as keyof typeof delivery.recipient.role]: _omitted, ...role } =
      delivery.recipient.role;
    const recipient = { ...delivery.recipient, role };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["id", 1],
    ["name", 1],
    ["name", undefined],
    ["isAdministrator", "true"],
  ])("refuses a role's %s as %j", (field, value) => {
    const recipient = {
      ...delivery.recipient,
      role: { ...delivery.recipient.role, [field]: value },
    };

    expect(
      alertDetailSchema.safeParse({ ...emailChange, deliveries: [{ ...delivery, recipient }] })
        .success,
    ).toBe(false);
  });

  it.each([undefined, null, [], "alert"])("refuses %j as an alert", (body) => {
    expect(alertDetailSchema.safeParse(body).success).toBe(false);
  });

  describe("per kind", () => {
    const base = { ...emailChange, deliveries: [] };
    const detailOf = {
      backoffice_passkey_changed: {
        action: "removed",
        passkeyName: "Teléfono",
        actorId: "admin-1",
        via: "administrator",
        actorName: "Ada",
      },
      backoffice_recovery_requested: {
        requestedAt: "2026-05-04T13:00:00.000Z",
        issuedAt: "2026-05-04T13:00:01.000Z",
        expiresAt: "2026-05-04T13:15:00.000Z",
      },
      user_email_changed: emailChange.detail,
      backoffice_sign_in_lockout: {
        sourceAddress: "203.0.113.5",
        failureCount: 6,
        blockedUntil: "2026-05-04T13:15:00.000Z",
      },
      user_access_increased: { cause: "created_as_administrator", actorId: "a", actorName: "Ada" },
      register_enrolled: {
        change: "enrolled",
        deviceId: "device-1",
        hostname: "CAJA",
        windowsVersion: "11",
        replacedInstallation: true,
      },
      events_quarantined: { deviceId: "device-1" },
      event_invariant_violated: {
        eventId: "event-1",
        eventType: "sale_completed",
        aggregateType: "Sale",
        aggregateId: "sale-1",
        breaks: ["approved_payments_below_total"],
      },
      arca_certificate_expiring: { notAfter: "2026-11-20T15:30:00.000Z" },
      arca_wsaa_ticket_held: { retryIntervalMinutes: 10 },
      update_required: { deviceId: "device-1", appVersion: "0.9.0" },
      register_silent: { deviceId: "device-1", lastAcceptedPushAt: "2026-10-05T14:30:00.000Z" },
      sales_denied: { deviceId: "device-1", reason: "event_history_broken" },
      fiscal_rejected: {
        pointOfSale: 12,
        documentType: "factura_c",
        rejectionClass: "content",
        fiscalDocumentId: "fiscal-document-1",
        saleId: "sale-1",
        rejections: [{ code: 10242, message: "El valor de CondicionIVAReceptorId es invalido." }],
      },
      offline_authorization_code_missing: {
        deviceId: "device-1",
        fortnightStart: "2026-10-16",
        fortnightEnd: "2026-10-31",
        fortnightStarted: false,
      },
      late_payment_refund: { saleId: "sale-1", amount: 250000, providerOrderId: "ORD01" },
      refund_task: {
        saleId: "sale-1",
        amount: 1240000,
        method: "TRANSFER",
        refundOpenedAt: "2026-10-05T12:00:00.000Z",
      },
      fiscal_emission_stopped: { deviceId: "device-1", reason: "legal_name_missing" },
      clock_drift: { deviceId: "device-1" },
      outbox_chain_broken: { deviceId: "device-1" },
      lots_expiring: { lotCount: 3, windowDays: 30, aboutViewerBranch: true },
      offsite_dump_unverified: { night: "2026-10-14", reason: "not_reported" },
      fortnight_report_pending: {
        pointOfSaleNumber: 4,
        registerId: "register-1",
        registerName: "Caja 1",
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
        deadline: "2026-09-23",
        daysLeft: 3,
        reason: "blocked",
      },
      fortnight_report_overdue: {
        pointOfSaleNumber: 4,
        registerId: "register-1",
        registerName: "Caja 1",
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
        deadline: "2026-09-23",
      },
      external_billing: { pointOfSale: 12, documentType: "factura_c", number: 41 },
      invoice_already_credited: { pointOfSale: 12, number: 41, saleId: "sale-1" },
      clock_corrected: {
        pointOfSale: 12,
        documentType: "factura_c",
        previousReading: "2026-10-03T12:00:00.000Z",
        correctedReading: "2026-10-01T12:00:00.000Z",
        actorId: "user-1",
        actorName: "Ada",
      },
      register_backup_overdue: {
        lastVerifiedGenerationAt: "2026-10-14T08:00:00.000Z",
        firstChangeAt: "2026-10-14T09:15:00.000Z",
      },
      fortnight_report_needs_regularization: {
        pointOfSaleNumber: 4,
        registerId: "register-1",
        registerName: "Caja 1",
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
      },
      fortnight_report_owed_elsewhere: {
        pointOfSaleNumber: 9,
        fortnightStart: "2026-09-01",
        fortnightEnd: "2026-09-15",
      },
      fiscal_unknown: {
        fiscalDocumentId: "document-1",
        saleId: "sale-1",
        registerId: "register-1",
        pointOfSale: 12,
        number: 41,
        unclearSince: "2026-10-05T12:00:00.000Z",
      },
    } satisfies Record<AlertKind, unknown>;

    it.each(ALERT_KINDS)("accepts the detail of %s", (kind) => {
      const alert = { ...base, kind, detail: detailOf[kind] };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    const requiredFields = ALERT_KINDS.flatMap((kind) =>
      Object.keys(detailOf[kind])
        .filter(
          (field) => field !== "actorName" && field !== "sourceAddress" && field !== "registerName",
        )
        .map((field) => [kind, field] as const),
    );
    it.each(requiredFields)("requires %s's %s", (kind, field) => {
      const { [field]: _omitted, ...detail } = detailOf[kind] as Record<string, unknown>;

      expect(alertDetailSchema.safeParse({ ...base, kind, detail }).success).toBe(false);
    });

    it("accepts an overdue-backup alert of a register that never had a verified generation", () => {
      const alert = {
        ...base,
        kind: "register_backup_overdue",
        detail: { ...detailOf.register_backup_overdue, lastVerifiedGenerationAt: null },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      ["a fractional point of sale", { pointOfSale: 1.5 }],
      ["a fractional number", { number: 41.5 }],
      ["a point of sale as text", { pointOfSale: "12" }],
      ["an unclear moment as a number", { unclearSince: 1 }],
      ["a sale that is not text", { saleId: 1 }],
    ])("refuses an unclear-outcome alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "fiscal_unknown",
        detail: { ...detailOf.fiscal_unknown, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it.each(OFFSITE_DUMP_UNVERIFIED_REASONS.filter((reason) => reason !== "shrank"))(
      "accepts an unverified-dump alert naming the night and the reason %s",
      (reason) => {
        const alert = {
          ...base,
          kind: "offsite_dump_unverified",
          detail: { night: "2026-10-14", reason },
        };

        expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
      },
    );

    it("accepts an unverified-dump alert of a shrank dump naming the threshold it fell below", () => {
      const alert = {
        ...base,
        kind: "offsite_dump_unverified",
        detail: { night: "2026-10-14", reason: "shrank", shrinkThresholdPercent: 50 },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      ["an unknown reason", { reason: "disk_full" }],
      ["a night as a number", { night: 20261014 }],
      ["a shrank dump without its threshold", { reason: "shrank" }],
      [
        "a shrank dump with a fractional threshold",
        { reason: "shrank", shrinkThresholdPercent: 50.5 },
      ],
    ])("refuses an unverified-dump alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "offsite_dump_unverified",
        detail: { night: "2026-10-14", reason: "not_reported", ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("accepts a lots-expiring alert with the count of lots, the window in days and whether it is about the viewer's branch", () => {
      const alert = {
        ...base,
        kind: "lots_expiring",
        detail: { lotCount: 3, windowDays: 30, aboutViewerBranch: false },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      ["a lot count as text", { lotCount: "3" }],
      ["a window as text", { windowDays: "30" }],
      ["its branch as text", { aboutViewerBranch: "true" }],
    ])("refuses a lots-expiring alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "lots_expiring",
        detail: { lotCount: 3, windowDays: 30, aboutViewerBranch: true, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it.each([
      "fortnight_report_pending",
      "fortnight_report_overdue",
      "fortnight_report_needs_regularization",
    ] as const)("accepts a %s alert that names no register", (kind) => {
      const { registerName: _omitted, ...detail } = detailOf[kind];
      const alert = { ...base, kind, detail };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each(["blocked", "missing_document", "refused", "pending"])(
      "accepts a pending fortnight report alert waiting for the reason %s",
      (reason) => {
        const alert = {
          ...base,
          kind: "fortnight_report_pending",
          detail: { ...detailOf.fortnight_report_pending, reason },
        };

        expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
      },
    );

    it.each([
      ["a reason outside the four it can have", { reason: "unknown" }],
      ["days left as text", { daysLeft: "3" }],
      ["fractional days left", { daysLeft: 1.5 }],
      ["a fractional point of sale", { pointOfSaleNumber: 4.5 }],
    ])("refuses a pending fortnight report alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "fortnight_report_pending",
        detail: { ...detailOf.fortnight_report_pending, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("accepts a late payment refund alert that names no order", () => {
      const alert = {
        ...base,
        kind: "late_payment_refund",
        detail: { saleId: "sale-1", amount: 250000, providerOrderId: null },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it("accepts a sales-denied alert of a register whose local database is damaged", () => {
      const alert = {
        ...base,
        kind: "sales_denied",
        detail: { deviceId: "device-1", reason: "local_database_damaged" },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it("refuses a sales-denied alert with a reason the register does not report", () => {
      const alert = {
        ...base,
        kind: "sales_denied",
        detail: { deviceId: "device-1", reason: "installation_revoked" },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("refuses a fiscal-emission-stopped alert with a reason the pre-emission check does not fail for", () => {
      const alert = {
        ...base,
        kind: "fiscal_emission_stopped",
        detail: { deviceId: "device-1", reason: "out_of_paper" },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it.each([
      ["a rejection class the domain does not know", { rejectionClass: "transport" }],
      ["a document type the domain does not know", { documentType: "factura_a" }],
      ["a rejection without its message", { rejections: [{ code: 10242 }] }],
      ["a rejection with a fractional code", { rejections: [{ code: 1.5, message: "x" }] }],
    ])("refuses a fiscal-rejected alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "fiscal_rejected",
        detail: { ...detailOf.fiscal_rejected, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it.each([
      ["a document type the domain does not know", { documentType: "factura_a" }],
      ["a fractional point of sale", { pointOfSale: 1.5 }],
      ["a previous reading as a number", { previousReading: 1 }],
      ["a corrected reading as a number", { correctedReading: 1 }],
    ])("refuses a clock corrected alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "clock_corrected",
        detail: { ...detailOf.clock_corrected, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("accepts a clock corrected alert that names nobody", () => {
      const { actorName: _omitted, ...detail } = detailOf.clock_corrected;
      const alert = { ...base, kind: "clock_corrected", detail };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      ["a document type the domain does not know", { documentType: "factura_a" }],
      ["a fractional number", { number: 41.5 }],
      ["a number as text", { number: "41" }],
    ])("refuses an external billing alert with %s", (_case, change) => {
      const alert = {
        ...base,
        kind: "external_billing",
        detail: { ...detailOf.external_billing, ...change },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("accepts an external billing alert about a credit note C", () => {
      const alert = {
        ...base,
        kind: "external_billing",
        detail: { ...detailOf.external_billing, documentType: "credit_note_c" },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it("refuses a silent register with no last accepted push", () => {
      const alert = {
        ...base,
        kind: "register_silent",
        detail: { deviceId: "device-1", lastAcceptedPushAt: null },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    it("takes a detail of another kind as a mismatch", () => {
      expect(
        alertDetailSchema.safeParse({
          ...base,
          kind: "register_enrolled",
          detail: emailChange.detail,
        }).success,
      ).toBe(false);
    });

    it("leaves out the actor's name when it could not be resolved", () => {
      const { actorName: _name, ...detail } = emailChange.detail;

      expect(alertDetailSchema.safeParse({ ...emailChange, detail }).data).toEqual({
        ...emailChange,
        detail,
      });
    });

    it("accepts a lockout whose source address was withheld", () => {
      const { sourceAddress: _hash, ...detail } = detailOf.backoffice_sign_in_lockout;
      const closed = { ...base, kind: "backoffice_sign_in_lockout", detail };

      expect(alertDetailSchema.safeParse(closed).data).toEqual(closed);
    });

    const passkey = { passkeyName: "Teléfono", actorId: "u-1" };
    it.each([
      [{ action: "registered", via: "self" }],
      [{ action: "removed", via: "self" }],
      [{ action: "registered", via: "recovery" }],
      [{ action: "removed", via: "administrator" }],
    ])("accepts a passkey change %j", (kindOfChange) => {
      const alert = {
        ...base,
        kind: "backoffice_passkey_changed",
        detail: { ...passkey, ...kindOfChange },
      };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      [{ action: "removed", via: "recovery" }],
      [{ action: "registered", via: "administrator" }],
      [{ action: "restored", via: "self" }],
      [{ action: "registered", via: "device" }],
    ])("refuses a passkey change %j", (kindOfChange) => {
      const alert = {
        ...base,
        kind: "backoffice_passkey_changed",
        detail: { ...passkey, ...kindOfChange },
      };

      expect(alertDetailSchema.safeParse(alert).success).toBe(false);
    });

    const roleChange = {
      cause: "role_assigned",
      actorId: "a",
      previousRole: { name: "Cajera", isAdministrator: false },
      newRole: { name: null, isAdministrator: true },
    };
    const permissionsAdded = {
      cause: "role_permissions_added",
      actorId: "a",
      roleName: "Cajera",
      addedPermissionKeys: ["configure_branch"],
    };
    it.each([[roleChange], [permissionsAdded]])("accepts an access increase %j", (detail) => {
      const alert = { ...base, kind: "user_access_increased", detail };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    it.each([
      [{ ...roleChange, cause: "role_removed" }],
      [{ ...roleChange, previousRole: { name: "Cajera" } }],
      [{ ...roleChange, newRole: { name: 1, isAdministrator: true } }],
      [{ ...roleChange, newRole: { name: null, isAdministrator: "yes" } }],
      [{ ...permissionsAdded, addedPermissionKeys: [1] }],
      [{ ...permissionsAdded, roleName: undefined }],
      [{ cause: "created_as_administrator" }],
      [{ ...roleChange, previousRole: undefined }],
      [{ ...roleChange, newRole: undefined }],
    ])("refuses an access increase %j", (detail) => {
      expect(
        alertDetailSchema.safeParse({ ...base, kind: "user_access_increased", detail }).success,
      ).toBe(false);
    });

    it.each([
      ["failureCount", "6"],
      ["blockedUntil", 1],
      ["sourceAddress", 1],
    ])("refuses a lockout's %s as %j", (field, value) => {
      const detail = { ...detailOf.backoffice_sign_in_lockout, [field]: value };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "backoffice_sign_in_lockout", detail })
          .success,
      ).toBe(false);
    });

    it("accepts the revocation of a register's installation", () => {
      const detail = {
        change: "revoked",
        deviceId: "device-1",
        hostname: "CAJA",
        windowsVersion: "11",
      };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "register_enrolled", detail }).success,
      ).toBe(true);
    });

    it("refuses a register installation change that does not say which change it is", () => {
      const { change: _change, ...detail } = detailOf.register_enrolled;

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "register_enrolled", detail }).success,
      ).toBe(false);
    });

    it("drops the enrollment's replaced flag from a revocation", () => {
      const detail = { ...detailOf.register_enrolled, change: "revoked" };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "register_enrolled", detail }).data?.detail,
      ).not.toHaveProperty("replacedInstallation");
    });

    it("refuses a register enrollment that does not say whether it replaced one", () => {
      const detail = { ...detailOf.register_enrolled, replacedInstallation: "yes" };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "register_enrolled", detail }).success,
      ).toBe(false);
    });

    it("refuses a quarantine that does not name its device", () => {
      expect(
        alertDetailSchema.safeParse({ ...base, kind: "events_quarantined", detail: {} }).success,
      ).toBe(false);
    });

    it("refuses an invariant violation whose breaks are not a list of text", () => {
      const detail = { ...detailOf.event_invariant_violated, breaks: [1] };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "event_invariant_violated", detail }).success,
      ).toBe(false);
    });

    it("refuses a non-text actor name", () => {
      const detail = { ...emailChange.detail, actorName: 1 };

      expect(alertDetailSchema.safeParse({ ...emailChange, detail }).success).toBe(false);
    });
  });
});

describe("alertDetailSchema, declared time zone", () => {
  it.each(["openedAt", "escalatedAt", "resolvedAt"] as const)(
    "declares the zone %s is shown in on every kind",
    (field) => {
      for (const option of alertDetailSchema.options) {
        expect(option.shape[field].meta()).toEqual({ timeZone: ARGENTINA_TIME_ZONE });
      }
    },
  );
});
