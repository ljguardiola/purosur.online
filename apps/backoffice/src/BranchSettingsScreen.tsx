import { Button, Checkbox, InlineNotice, TextField } from "@purosur/ui";
import { Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { BranchSettings, BranchSettingsField, BranchSettingsHours } from "./branchSettingsApi";
import { fetchBranchSettings, saveBranchSettings } from "./branchSettingsApi";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";
import { sendToMyAccount } from "./settingsRoutes";

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
  | "goodConditionReturnDays";

type TextFieldName = "address" | "whatsappNumber" | "instagramHandle";

type HoursGroupName = "weekday" | "saturday" | "sunday";

type FieldErrorKey = TextFieldName | DaysFieldName | HoursGroupName;

type HoursGroupValues = { opensAt: string; closesAt: string; closed: boolean };

type HoursGroupErrors = { opensAt?: string; closesAt?: string };

type FieldErrors = Partial<Record<TextFieldName | DaysFieldName, string>> &
  Partial<Record<HoursGroupName, HoursGroupErrors>>;

type FormValues = Record<TextFieldName, string> &
  Record<DaysFieldName, string> &
  Record<HoursGroupName, HoursGroupValues>;

const branchMessages = messages.settings.branch;

const WIRE_FIELD_OF: Record<FieldErrorKey, BranchSettingsField> = {
  address: "address",
  whatsappNumber: "whatsapp_number",
  instagramHandle: "instagram_handle",
  weekday: "weekday_hours",
  saturday: "saturday_hours",
  sunday: "sunday_hours",
  expiringLotAlertDays: "expiring_lot_alert_days",
  unreviewedPriceAlertDays: "unreviewed_price_alert_days",
  goodConditionReturnDays: "good_condition_return_days",
};

function fieldNameOfWire(field: BranchSettingsField): FieldErrorKey | undefined {
  const entry = (Object.entries(WIRE_FIELD_OF) as [FieldErrorKey, BranchSettingsField][]).find(
    ([, wire]) => wire === field,
  );
  return entry?.[0];
}

function hoursGroupValuesFrom(hours: BranchSettingsHours): HoursGroupValues {
  return hours === null
    ? { opensAt: "", closesAt: "", closed: true }
    : { opensAt: hours.opensAt, closesAt: hours.closesAt, closed: false };
}

function valuesFrom(settings: BranchSettings): FormValues {
  return {
    address: settings.address,
    whatsappNumber: settings.whatsappNumber,
    instagramHandle: settings.instagramHandle,
    weekday: hoursGroupValuesFrom(settings.weekdayHours),
    saturday: hoursGroupValuesFrom(settings.saturdayHours),
    sunday: hoursGroupValuesFrom(settings.sundayHours),
    expiringLotAlertDays: String(settings.expiringLotAlertDays),
    unreviewedPriceAlertDays: String(settings.unreviewedPriceAlertDays),
    goodConditionReturnDays: String(settings.goodConditionReturnDays),
  };
}

// The server stores each days value in a Postgres `integer` column and rejects anything above it.
const DAYS_MAX = 2147483647;

function parseDays(value: string): number | undefined {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** Accepts "9:00" or "09:00" (a single- or zero-padded hour, always two-digit minutes) and answers
 * the zero-padded "HH:MM" the server expects, or `undefined` for anything else. */
function normalizedTime(value: string): string | undefined {
  const match = /^([0-9]{1,2}):([0-5][0-9])$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  if (hour > 23) {
    return undefined;
  }
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

/** Validates every days field client-side, mirroring the server (`branch-settings-validation.ts`):
 * an integer from 0 to `DAYS_MAX`. Returns one error per invalid field, keyed by our own field name so it
 * lines up directly with the corresponding TextField's `invalid`/`errorMessage` props. */
function validateDaysFields(values: FormValues): Partial<Record<DaysFieldName, string>> {
  const errors: Partial<Record<DaysFieldName, string>> = {};
  const daysFields: readonly DaysFieldName[] = [
    "expiringLotAlertDays",
    "unreviewedPriceAlertDays",
    "goodConditionReturnDays",
  ];
  for (const field of daysFields) {
    const parsed = parseDays(values[field]);
    if (parsed === undefined) {
      errors[field] = branchMessages.daysFieldError;
    } else if (parsed > DAYS_MAX) {
      errors[field] = branchMessages.daysTooLargeError;
    }
  }
  return errors;
}

/** Validates every hours group client-side, mirroring the server: closed needs nothing, and an
 * open group needs two valid HH:MM times with closing strictly later than opening. A time that
 * isn't valid is marked on its own field; closing not later than opening is marked on Cierra. */
function validateHoursFields(
  values: FormValues,
): Partial<Record<HoursGroupName, HoursGroupErrors>> {
  const errors: Partial<Record<HoursGroupName, HoursGroupErrors>> = {};
  const groups: readonly HoursGroupName[] = ["weekday", "saturday", "sunday"];
  for (const group of groups) {
    const groupValues = values[group];
    if (groupValues.closed) {
      continue;
    }
    const opensAt = normalizedTime(groupValues.opensAt);
    const closesAt = normalizedTime(groupValues.closesAt);
    const groupErrors: HoursGroupErrors = {};
    if (opensAt === undefined) {
      groupErrors.opensAt = branchMessages.hoursFormatError;
    }
    if (closesAt === undefined) {
      groupErrors.closesAt = branchMessages.hoursFormatError;
    } else if (opensAt !== undefined && closesAt <= opensAt) {
      groupErrors.closesAt = branchMessages.hoursOrderError;
    }
    if (groupErrors.opensAt !== undefined || groupErrors.closesAt !== undefined) {
      errors[group] = groupErrors;
    }
  }
  return errors;
}

function hoursSettingsOf(groupValues: HoursGroupValues): BranchSettingsHours {
  if (groupValues.closed) {
    return null;
  }
  // Only reached once `validateHoursFields` found this group's times valid, so the fallback to ""
  // never actually renders: it only satisfies the type checker.
  return {
    opensAt: normalizedTime(groupValues.opensAt) ?? "",
    closesAt: normalizedTime(groupValues.closesAt) ?? "",
  };
}

function settingsFrom(values: FormValues, version: number): BranchSettings {
  return {
    address: values.address,
    whatsappNumber: values.whatsappNumber,
    instagramHandle: values.instagramHandle,
    weekdayHours: hoursSettingsOf(values.weekday),
    saturdayHours: hoursSettingsOf(values.saturday),
    sundayHours: hoursSettingsOf(values.sunday),
    expiringLotAlertDays: Number(values.expiringLotAlertDays),
    unreviewedPriceAlertDays: Number(values.unreviewedPriceAlertDays),
    goodConditionReturnDays: Number(values.goodConditionReturnDays),
    version,
  };
}

/** The field's own error for a save the server rejected on it; `version` never renders inline. The
 * client already checked each time's format, so an hours group the server rejects is shown as its
 * closing time not being later than its opening, on Cierra. */
function serverFieldErrors(field: FieldErrorKey): FieldErrors {
  if (field === "weekday" || field === "saturday" || field === "sunday") {
    return { [field]: { closesAt: branchMessages.hoursOrderError } };
  }
  if (
    field === "expiringLotAlertDays" ||
    field === "unreviewedPriceAlertDays" ||
    field === "goodConditionReturnDays"
  ) {
    return { [field]: branchMessages.daysFieldError };
  }
  return { [field]: branchMessages.textFieldError };
}

const CLOSED_HOURS_GROUP: HoursGroupValues = { opensAt: "", closesAt: "", closed: true };

const EMPTY_VALUES: FormValues = {
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  weekday: CLOSED_HOURS_GROUP,
  saturday: CLOSED_HOURS_GROUP,
  sunday: CLOSED_HOURS_GROUP,
  expiringLotAlertDays: "",
  unreviewedPriceAlertDays: "",
  goodConditionReturnDays: "",
};

/**
 * "Sucursal": the branch's ticket header, hours of attention, and alert/return windows, reserved
 * to `configure_branch` (an Administrator always holds it implicitly) the same way
 * `EditRoleScreen` is reserved to the Administrator. Unlike a role edit, saving here carries no
 * passkey step-up (see the feature document's decisions): it isn't a sensitive action.
 */
export function BranchSettingsScreen({ onSessionEnded, services }: BranchSettingsScreenProps) {
  const { fetchBranchSettings, saveBranchSettings } =
    services ?? defaultBranchSettingsScreenServices;
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [version, setVersion] = useState(0);
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<FormNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // One id per group's row heading, named by React so it stays stable across renders (unlike a
  // hand-rolled string, which react-hooks/rules-of-hooks would refuse from inside `hoursRow`, a
  // plain helper rather than a component or a custom hook).
  const weekdayHeadingId = useId();
  const saturdayHeadingId = useId();
  const sundayHeadingId = useId();
  const hoursHeadingId: Record<HoursGroupName, string> = {
    weekday: weekdayHeadingId,
    saturday: saturdayHeadingId,
    sunday: sundayHeadingId,
  };

  // Read from a ref, not a reactive dependency: the parent hands a new function on every render
  // (each session-activity touch re-renders it), which would otherwise reload the settings and
  // discard whatever was typed and not yet saved.
  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;

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
      onSessionEndedRef.current();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setState({ kind: "loadError" });
    }
  }, [fetchBranchSettings]);

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
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  function clearFieldError(field: FieldErrorKey) {
    if (!fieldErrors[field]) {
      return;
    }
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function setTextValue(field: TextFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function setDaysValue(field: DaysFieldName, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    clearFieldError(field);
  }

  function setHoursOpensAt(group: HoursGroupName, value: string) {
    setValues((current) => ({ ...current, [group]: { ...current[group], opensAt: value } }));
    clearFieldError(group);
  }

  function setHoursClosesAt(group: HoursGroupName, value: string) {
    setValues((current) => ({ ...current, [group]: { ...current[group], closesAt: value } }));
    clearFieldError(group);
  }

  function setHoursClosed(group: HoursGroupName, closed: boolean) {
    setValues((current) => ({ ...current, [group]: { ...current[group], closed } }));
    clearFieldError(group);
  }

  async function handleSubmit() {
    if (state.kind !== "loaded") {
      return;
    }
    const errors = { ...validateDaysFields(values), ...validateHoursFields(values) };
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
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "validation_failed") {
      const field = fieldNameOfWire(outcome.field);
      if (field) {
        setFieldErrors(serverFieldErrors(field));
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
          onChange={(value) => setTextValue(field, value)}
          {...(error ? { invalid: true, errorMessage: error } : {})}
        />
      </div>
    );
  }

  function daysField(field: DaysFieldName, label: string) {
    const error = fieldErrors[field];
    return (
      <div className="min-w-0 flex-1">
        <TextField
          kind="plain-text"
          label={label}
          value={values[field]}
          onChange={(value) => setDaysValue(field, value)}
          suffix={branchMessages.daysUnit}
          {...(error ? { invalid: true, errorMessage: error } : {})}
        />
      </div>
    );
  }

  function hoursRow(group: HoursGroupName, groupLabel: string) {
    const groupValues = values[group];
    const errors = fieldErrors[group];
    const headingId = hoursHeadingId[group];
    return (
      <div key={group} className="flex items-end gap-4">
        <div className="flex h-[3.25rem] w-36 shrink-0 items-center">
          <p id={headingId} className="font-semibold text-ink">
            {groupLabel}
          </p>
        </div>
        <div className="flex-1">
          <TextField
            kind="plain-text"
            label={branchMessages.opensAtLabel}
            labelledBy={headingId}
            value={groupValues.closed ? "" : groupValues.opensAt}
            onChange={(value) => setHoursOpensAt(group, value)}
            disabled={groupValues.closed}
            {...(errors?.opensAt ? { invalid: true, errorMessage: errors.opensAt } : {})}
          />
        </div>
        <div className="flex-1">
          <TextField
            kind="plain-text"
            label={branchMessages.closesAtLabel}
            labelledBy={headingId}
            value={groupValues.closed ? "" : groupValues.closesAt}
            onChange={(value) => setHoursClosesAt(group, value)}
            disabled={groupValues.closed}
            {...(errors?.closesAt ? { invalid: true, errorMessage: errors.closesAt } : {})}
          />
        </div>
        <div className="flex h-[3.25rem] items-center">
          <Checkbox
            isSelected={groupValues.closed}
            onChange={(closed) => setHoursClosed(group, closed)}
          >
            <span aria-hidden="true">{branchMessages.closedLabel}</span>
            <span className="sr-only">{branchMessages.closedAria({ group: groupLabel })}</span>
          </Checkbox>
        </div>
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
              {textField("address", branchMessages.addressLabel)}
              {textField("whatsappNumber", branchMessages.whatsappLabel)}
            </div>
            <div className="flex gap-4">
              {textField("instagramHandle", branchMessages.instagramLabel)}
            </div>
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="font-bold text-brand-blue-strong text-lg">
              {branchMessages.hoursHeading}
            </h2>
            {hoursRow("weekday", branchMessages.weekdayHoursLabel)}
            {hoursRow("saturday", branchMessages.saturdayHoursLabel)}
            {hoursRow("sunday", branchMessages.sundayHoursLabel)}
          </div>
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="font-bold text-brand-blue-strong text-lg">
              {branchMessages.deadlinesHeading}
            </h2>
            <div className="flex gap-4">
              {daysField("expiringLotAlertDays", branchMessages.expiringLotAlertDaysLabel)}
              {daysField("unreviewedPriceAlertDays", branchMessages.unreviewedPriceAlertDaysLabel)}
              {daysField("goodConditionReturnDays", branchMessages.goodConditionReturnDaysLabel)}
            </div>
          </div>
        </div>
      )}
    </ScreenLayout>
  );
}
