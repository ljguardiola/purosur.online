import { Button, InlineNotice, TextField } from "@purosur/ui";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { BranchSettings, BranchSettingsField } from "./branchSettingsApi";
import { fetchBranchSettings, saveBranchSettings } from "./branchSettingsApi";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";

export type BranchSettingsScreenServices = {
  fetchBranchSettings: typeof fetchBranchSettings;
  saveBranchSettings: typeof saveBranchSettings;
};

export const defaultBranchSettingsScreenServices: BranchSettingsScreenServices = {
  fetchBranchSettings,
  saveBranchSettings,
};

export type BranchSettingsScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API. */
  services?: BranchSettingsScreenServices;
};

type LoadState = { kind: "loading" } | { kind: "loadError" } | { kind: "loaded" };

type FormNotice = { kind: "attemptFailed" } | { kind: "staleVersion" } | { kind: "reloadFailed" };

type DaysFieldName =
  | "expiringLotAlertDays"
  | "unreviewedPriceAlertDays"
  | "goodConditionReturnDays"
  | "defectiveReturnDays";

type TextFieldName =
  | "businessName"
  | "address"
  | "whatsappNumber"
  | "instagramHandle"
  | "weekdayHours"
  | "saturdayHours"
  | "sundayHours"
  | "timezone";

type FormValues = Record<TextFieldName, string> & Record<DaysFieldName, string>;

const branchMessages = messages.settings.branch;

const WIRE_FIELD_OF: Record<TextFieldName | DaysFieldName, BranchSettingsField> = {
  businessName: "business_name",
  address: "address",
  whatsappNumber: "whatsapp_number",
  instagramHandle: "instagram_handle",
  weekdayHours: "weekday_hours",
  saturdayHours: "saturday_hours",
  sundayHours: "sunday_hours",
  timezone: "timezone",
  expiringLotAlertDays: "expiring_lot_alert_days",
  unreviewedPriceAlertDays: "unreviewed_price_alert_days",
  goodConditionReturnDays: "good_condition_return_days",
  defectiveReturnDays: "defective_return_days",
};

function fieldNameOfWire(field: BranchSettingsField): TextFieldName | DaysFieldName | undefined {
  const entry = (
    Object.entries(WIRE_FIELD_OF) as [TextFieldName | DaysFieldName, BranchSettingsField][]
  ).find(([, wire]) => wire === field);
  return entry?.[0];
}

function valuesFrom(settings: BranchSettings): FormValues {
  return {
    businessName: settings.businessName,
    address: settings.address,
    whatsappNumber: settings.whatsappNumber,
    instagramHandle: settings.instagramHandle,
    weekdayHours: settings.weekdayHours,
    saturdayHours: settings.saturdayHours,
    sundayHours: settings.sundayHours,
    timezone: settings.timezone,
    expiringLotAlertDays: String(settings.expiringLotAlertDays),
    unreviewedPriceAlertDays: String(settings.unreviewedPriceAlertDays),
    goodConditionReturnDays: String(settings.goodConditionReturnDays),
    defectiveReturnDays: String(settings.defectiveReturnDays),
  };
}

function parseDays(value: string): number | undefined {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Every days field's floor: 0 for every window but the defective one, whose legal floor is 180. */
function daysFloor(field: DaysFieldName): number {
  return field === "defectiveReturnDays" ? 180 : 0;
}

function daysFieldErrorMessage(field: DaysFieldName): string {
  return field === "defectiveReturnDays"
    ? branchMessages.defectiveDaysFieldError
    : branchMessages.daysFieldError;
}

/**
 * Validates every days field client-side, mirroring the server (`branch-settings-validation.ts`):
 * an integer at or above its floor. Returns one error per invalid field, keyed by our own field
 * name so it lines up directly with the corresponding TextField's `invalid`/`errorMessage` props.
 */
function validateDaysFields(values: FormValues): Partial<Record<DaysFieldName, string>> {
  const errors: Partial<Record<DaysFieldName, string>> = {};
  const daysFields: readonly DaysFieldName[] = [
    "expiringLotAlertDays",
    "unreviewedPriceAlertDays",
    "goodConditionReturnDays",
    "defectiveReturnDays",
  ];
  for (const field of daysFields) {
    const parsed = parseDays(values[field]);
    if (parsed === undefined || parsed < daysFloor(field)) {
      errors[field] = daysFieldErrorMessage(field);
    }
  }
  return errors;
}

function settingsFrom(values: FormValues, version: number): BranchSettings {
  return {
    businessName: values.businessName,
    address: values.address,
    whatsappNumber: values.whatsappNumber,
    instagramHandle: values.instagramHandle,
    weekdayHours: values.weekdayHours,
    saturdayHours: values.saturdayHours,
    sundayHours: values.sundayHours,
    timezone: values.timezone,
    expiringLotAlertDays: Number(values.expiringLotAlertDays),
    unreviewedPriceAlertDays: Number(values.unreviewedPriceAlertDays),
    goodConditionReturnDays: Number(values.goodConditionReturnDays),
    defectiveReturnDays: Number(values.defectiveReturnDays),
    version,
  };
}

/** The field's own error for a save the server rejected on it; `version` never renders inline. */
function fieldErrorMessage(field: TextFieldName | DaysFieldName): string {
  if (field === "timezone") {
    return branchMessages.timezoneFieldError;
  }
  if (
    field === "expiringLotAlertDays" ||
    field === "unreviewedPriceAlertDays" ||
    field === "goodConditionReturnDays" ||
    field === "defectiveReturnDays"
  ) {
    return daysFieldErrorMessage(field);
  }
  return branchMessages.textFieldError;
}

const EMPTY_VALUES: FormValues = {
  businessName: "",
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  weekdayHours: "",
  saturdayHours: "",
  sundayHours: "",
  timezone: "",
  expiringLotAlertDays: "",
  unreviewedPriceAlertDays: "",
  goodConditionReturnDays: "",
  defectiveReturnDays: "",
};

/**
 * "Sucursal": the branch's ticket header, hours, timezone, and alert/return windows, reserved to
 * `configure_branch` (an Administrator always holds it implicitly) the same way `EditRoleScreen`
 * is reserved to the Administrator. Unlike a role edit, saving here carries no passkey step-up
 * (see the feature document's decisions): it isn't a sensitive action.
 */
export function BranchSettingsScreen({ onSessionEnded, services }: BranchSettingsScreenProps) {
  const { fetchBranchSettings, saveBranchSettings } =
    services ?? defaultBranchSettingsScreenServices;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<TextFieldName | DaysFieldName, string>>
  >({});
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await fetchBranchSettings();
    if (outcome.kind === "ok") {
      setValues(valuesFrom(outcome.value));
      setVersion(outcome.value.version);
      setFieldErrors({});
      setNotice(null);
      setState({ kind: "loaded" });
    } else if (outcome.kind === "unauthenticated") {
      onSessionEnded();
    } else {
      setState({ kind: "loadError" });
    }
  }, [fetchBranchSettings, onSessionEnded]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleReload() {
    setSubmitting(true);
    const outcome = await fetchBranchSettings();
    if (outcome.kind === "ok") {
      setValues(valuesFrom(outcome.value));
      setVersion(outcome.value.version);
      setFieldErrors({});
      setNotice(null);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  function setValue(field: TextFieldName | DaysFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
  }

  async function handleSubmit() {
    if (state.kind !== "loaded") {
      return;
    }
    const errors = validateDaysFields(values);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setNotice(null);
    setSubmitting(true);

    const outcome = await saveBranchSettings(settingsFrom(values, version));
    if (outcome.kind === "ok") {
      setValues(valuesFrom(outcome.value));
      setVersion(outcome.value.version);
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "validation_failed") {
      const field = fieldNameOfWire(outcome.field);
      if (field) {
        setFieldErrors({ [field]: fieldErrorMessage(field) });
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";

  function textField(field: TextFieldName, label: string) {
    const error = fieldErrors[field];
    return (
      <div className="flex-1">
        <TextField
          kind="plain-text"
          label={label}
          value={values[field]}
          onChange={(value) => setValue(field, value)}
          {...(error ? { invalid: true, errorMessage: error } : {})}
        />
      </div>
    );
  }

  function daysField(field: DaysFieldName, label: string) {
    const error = fieldErrors[field];
    return (
      <div className="flex-1">
        <TextField
          kind="quantity"
          label={label}
          value={values[field]}
          onChange={(value) => setValue(field, value)}
          suffix={branchMessages.daysUnit}
          {...(error ? { invalid: true, errorMessage: error } : {})}
        />
      </div>
    );
  }

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center justify-between border-line border-b bg-surface-white px-8">
          <div className="flex flex-col justify-center">
            <p className="text-ink-secondary text-sm">{branchMessages.breadcrumb}</p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">{branchMessages.heading}</h1>
          </div>
          <Button
            variant="primary"
            icon={<Check />}
            isDisabled={submitting || state.kind !== "loaded"}
            onPress={() => void handleSubmit()}
          >
            {branchMessages.save}
          </Button>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {state.kind === "loading" && <p role="status">{branchMessages.loading}</p>}
      {state.kind === "loadError" && (
        <>
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={branchMessages.loadErrorTitle}
            detail={branchMessages.loadErrorDetail}
          />
          <Button variant="secondary" onPress={() => void load()}>
            {branchMessages.retry}
          </Button>
        </>
      )}
      {notice?.kind === "attemptFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={branchMessages.attemptFailedTitle}
          detail={branchMessages.attemptFailedDetail}
        />
      )}
      {notice?.kind === "staleVersion" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={branchMessages.staleVersionTitle}
          detail={branchMessages.staleVersionDetail}
        />
      )}
      {notice?.kind === "reloadFailed" && (
        <InlineNotice
          tone="error"
          icon={<TriangleAlert />}
          title={branchMessages.reloadFailedTitle}
          detail={branchMessages.attemptFailedDetail}
        />
      )}
      {offersReload && (
        <Button
          variant="secondary"
          icon={<RotateCcw />}
          isDisabled={submitting}
          onPress={() => void handleReload()}
        >
          {branchMessages.reload}
        </Button>
      )}
      {state.kind === "loaded" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="font-bold text-brand-blue-strong text-lg">
              {branchMessages.ticketHeaderHeading}
            </h2>
            <div className="flex gap-4">
              {textField("businessName", branchMessages.businessNameLabel)}
              {textField("address", branchMessages.addressLabel)}
            </div>
            <div className="flex gap-4">
              {textField("whatsappNumber", branchMessages.whatsappLabel)}
              {textField("instagramHandle", branchMessages.instagramLabel)}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="font-bold text-brand-blue-strong text-lg">
              {branchMessages.hoursHeading}
            </h2>
            <div className="flex gap-4">
              {textField("weekdayHours", branchMessages.weekdayHoursLabel)}
              {textField("saturdayHours", branchMessages.saturdayHoursLabel)}
              {textField("sundayHours", branchMessages.sundayHoursLabel)}
            </div>
            <div className="flex gap-4">{textField("timezone", branchMessages.timezoneLabel)}</div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="font-bold text-brand-blue-strong text-lg">
              {branchMessages.deadlinesHeading}
            </h2>
            <div className="flex gap-4">
              {daysField("expiringLotAlertDays", branchMessages.expiringLotAlertDaysLabel)}
              {daysField("unreviewedPriceAlertDays", branchMessages.unreviewedPriceAlertDaysLabel)}
              {daysField("goodConditionReturnDays", branchMessages.goodConditionReturnDaysLabel)}
              {daysField("defectiveReturnDays", branchMessages.defectiveReturnDaysLabel)}
            </div>
            <p className="text-ink-secondary text-sm">{branchMessages.defectiveFloorHelper}</p>
          </div>
        </div>
      )}
    </ScreenLayout>
  );
}
