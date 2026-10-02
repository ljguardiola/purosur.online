import { ALERT_KINDS, type AlertDetails, type AlertKind } from "@purosur/domain";
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
    ["deliveries", null],
    ["deliveries", {}],
  ])("refuses %s as %j", (field, value) => {
    expect(alertDetailSchema.safeParse({ ...emailChange, [field]: value }).success).toBe(false);
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
        deviceId: "device-1",
        hostname: "CAJA",
        windowsVersion: "11",
        replacedInstallation: true,
      },
    } satisfies Record<AlertKind, unknown>;

    it.each(ALERT_KINDS)("accepts the detail of %s", (kind) => {
      const alert = { ...base, kind, detail: detailOf[kind] };

      expect(alertDetailSchema.safeParse(alert).data).toEqual(alert);
    });

    const requiredFields = ALERT_KINDS.flatMap((kind) =>
      Object.keys(detailOf[kind])
        .filter((field) => field !== "actorName" && field !== "sourceAddress")
        .map((field) => [kind, field] as const),
    );
    it.each(requiredFields)("requires %s's %s", (kind, field) => {
      const { [field]: _omitted, ...detail } = detailOf[kind] as Record<string, unknown>;

      expect(alertDetailSchema.safeParse({ ...base, kind, detail }).success).toBe(false);
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

    it("refuses a register enrollment that does not say whether it replaced one", () => {
      const detail = { ...detailOf.register_enrolled, replacedInstallation: "yes" };

      expect(
        alertDetailSchema.safeParse({ ...base, kind: "register_enrolled", detail }).success,
      ).toBe(false);
    });

    it("refuses a non-text actor name", () => {
      const detail = { ...emailChange.detail, actorName: 1 };

      expect(alertDetailSchema.safeParse({ ...emailChange, detail }).success).toBe(false);
    });
  });
});
