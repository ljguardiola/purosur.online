import { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "@purosur/contracts";
import {
  Button,
  backofficeFieldHeightClassName,
  Checkbox,
  IconButton,
  type IconButtonProps,
  InlineNotice,
  TextField,
} from "@purosur/ui";
import { Check, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  BranchDay,
  BranchHoursRange,
  BranchSettings,
  BranchSettingsField,
} from "./branchSettingsApi";
import {
  BRANCH_DAYS,
  DAY_FIELD_OF,
  fetchBranchSettings,
  saveBranchSettings,
} from "./branchSettingsApi";
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

type PointerType = Parameters<NonNullable<IconButtonProps["onPress"]>>[0]["pointerType"];

type FormNotice = { kind: "attemptFailed" } | { kind: "staleVersion" } | { kind: "reloadFailed" };

type DaysFieldName =
  | "expiringLotAlertDays"
  | "unreviewedPriceAlertDays"
  | "goodConditionReturnDays";

type TextFieldName = "address" | "whatsappNumber" | "instagramHandle";

// `id` never leaves this screen (see `hoursSettingsOf`): it exists only so each range's own row
// keeps a stable React key across adds and removes, instead of the array index `noArrayIndexKey`
// warns against, which would shift onto the wrong row once an earlier range is removed.
type RangeValues = { id: number; opensAt: string; closesAt: string };

let nextRangeId = 0;
function makeRangeId(): number {
  nextRangeId += 1;
  return nextRangeId;
}

type DayValues = { closed: boolean; ranges: RangeValues[] };

type FieldErrorKey = TextFieldName | DaysFieldName | BranchDay;

type FieldErrors = Partial<Record<FieldErrorKey, string>>;

type FormValues = Record<TextFieldName, string> &
  Record<DaysFieldName, string> &
  Record<BranchDay, DayValues>;

const branchMessages = messages.settings.branch;

const WIRE_FIELD_OF: Record<FieldErrorKey, BranchSettingsField> = {
  address: "address",
  whatsappNumber: "whatsapp_number",
  instagramHandle: "instagram_handle",
  ...DAY_FIELD_OF,
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

const BRANCH_DAY_SET: ReadonlySet<string> = new Set(BRANCH_DAYS);

function isBranchDay(field: FieldErrorKey): field is BranchDay {
  return BRANCH_DAY_SET.has(field);
}

function emptyRange(): RangeValues {
  return { id: makeRangeId(), opensAt: "", closesAt: "" };
}

function dayValuesFrom(ranges: BranchHoursRange[]): DayValues {
  return ranges.length === 0
    ? { closed: true, ranges: [] }
    : { closed: false, ranges: ranges.map((range) => ({ id: makeRangeId(), ...range })) };
}

function valuesFrom(settings: BranchSettings): FormValues {
  const dayValues = {} as Record<BranchDay, DayValues>;
  for (const day of BRANCH_DAYS) {
    dayValues[day] = dayValuesFrom(settings.hours[day]);
  }
  return {
    address: settings.address,
    whatsappNumber: settings.whatsappNumber,
    instagramHandle: settings.instagramHandle,
    ...dayValues,
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

/** Every one of a day's ranges, normalized to zero-padded HH:MM, or `undefined` once any of them
 * isn't a valid time. */
function normalizedDayRanges(ranges: RangeValues[]): BranchHoursRange[] | undefined {
  const normalized: BranchHoursRange[] = [];
  for (const range of ranges) {
    const opensAt = normalizedTime(range.opensAt);
    const closesAt = normalizedTime(range.closesAt);
    if (opensAt === undefined || closesAt === undefined) {
      return undefined;
    }
    normalized.push({ opensAt, closesAt });
  }
  return normalized;
}

/** True once any two ranges share a moment in time, mirroring `branch-settings-validation.ts`'s own
 * `rangesOverlap`: a range that only touches another isn't an overlap. */
function rangesOverlap(ranges: BranchHoursRange[]): boolean {
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a !== undefined && b !== undefined && a.opensAt < b.closesAt && b.opensAt < a.closesAt) {
        return true;
      }
    }
  }
  return false;
}

/** Validates every open day's ranges client-side, mirroring the server: format, then order, then
 * overlap, each day showing at most one of these as a single message under its own row. */
function validateHoursFields(values: FormValues): Partial<Record<BranchDay, string>> {
  const errors: Partial<Record<BranchDay, string>> = {};
  for (const day of BRANCH_DAYS) {
    const dayValues = values[day];
    if (dayValues.closed) {
      continue;
    }
    const normalized = normalizedDayRanges(dayValues.ranges);
    if (normalized === undefined) {
      errors[day] = branchMessages.hoursFormatError;
      continue;
    }
    if (normalized.some((range) => range.closesAt <= range.opensAt)) {
      errors[day] = branchMessages.hoursOrderError;
      continue;
    }
    if (rangesOverlap(normalized)) {
      errors[day] = branchMessages.hoursOverlapError;
    }
  }
  return errors;
}

function hoursSettingsOf(dayValues: DayValues): BranchHoursRange[] {
  if (dayValues.closed) {
    return [];
  }
  // Only reached once `validateHoursFields` found every range of this day valid, so the fallback to
  // "" never actually renders: it only satisfies the type checker.
  return dayValues.ranges.map((range) => ({
    opensAt: normalizedTime(range.opensAt) ?? "",
    closesAt: normalizedTime(range.closesAt) ?? "",
  }));
}

function settingsFrom(values: FormValues, version: number): BranchSettings {
  const hours = {} as Record<BranchDay, BranchHoursRange[]>;
  for (const day of BRANCH_DAYS) {
    hours[day] = hoursSettingsOf(values[day]);
  }
  return {
    address: values.address,
    whatsappNumber: values.whatsappNumber,
    instagramHandle: values.instagramHandle,
    hours,
    expiringLotAlertDays: Number(values.expiringLotAlertDays),
    unreviewedPriceAlertDays: Number(values.unreviewedPriceAlertDays),
    goodConditionReturnDays: Number(values.goodConditionReturnDays),
    version,
  };
}

/** The field's own error for a save the server rejected on it; `version` never renders inline. The
 * server names a rejected day without saying whether its format, order, overlap or ranges count
 * failed, so the day gets a neutral message rather than guessing one of them. */
function serverFieldErrors(field: FieldErrorKey): FieldErrors {
  if (isBranchDay(field)) {
    return { [field]: branchMessages.hoursInvalidError };
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

const CLOSED_DAY: DayValues = { closed: true, ranges: [] };

const EMPTY_DAY_VALUES = Object.fromEntries(BRANCH_DAYS.map((day) => [day, CLOSED_DAY])) as Record<
  BranchDay,
  DayValues
>;

const EMPTY_VALUES: FormValues = {
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  ...EMPTY_DAY_VALUES,
  expiringLotAlertDays: "",
  unreviewedPriceAlertDays: "",
  goodConditionReturnDays: "",
};

/**
 * "Sucursal": the branch's ticket header, hours of attention, and alert/return windows, reserved
 * to `configure_branch` (an Administrator always holds it implicitly) the same way
 * `RoleEditorModal` is reserved to the Administrator. Unlike a role edit, saving here carries no
 * passkey step-up: branch settings aren't a sensitive action.
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
  const hoursErrorIdPrefix = useId();

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

  // Adding or removing a range unmounts the button that did it whenever the "+" reaches the cap or
  // the trash buttons go away, which would drop keyboard focus to the page itself; focus lands on
  // the added range, or on the range that takes the removed one's place, instead.
  const rangeElementsRef = useRef(new Map<number, HTMLElement>());
  const rangeToFocusRef = useRef<number | null>(null);
  useEffect(() => {
    const rangeId = rangeToFocusRef.current;
    if (rangeId === null) {
      return;
    }
    rangeToFocusRef.current = null;
    rangeElementsRef.current.get(rangeId)?.querySelector("input")?.focus();
  });

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

  function setDayClosed(day: BranchDay, closed: boolean) {
    setValues((current) => {
      const dayValues = current[day];
      const ranges = !closed && dayValues.ranges.length === 0 ? [emptyRange()] : dayValues.ranges;
      return { ...current, [day]: { closed, ranges } };
    });
    clearFieldError(day);
  }

  function setRangeValue(
    day: BranchDay,
    index: number,
    part: "opensAt" | "closesAt",
    value: string,
  ) {
    setValues((current) => {
      const ranges = current[day].ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [part]: value } : range,
      );
      return { ...current, [day]: { ...current[day], ranges } };
    });
    clearFieldError(day);
  }

  function addRange(day: BranchDay) {
    const added = emptyRange();
    setValues((current) => {
      if (current[day].ranges.length >= BRANCH_HOURS_RANGES_PER_DAY_MAX) {
        return current;
      }
      return {
        ...current,
        [day]: { ...current[day], ranges: [...current[day].ranges, added] },
      };
    });
    rangeToFocusRef.current = added.id;
    clearFieldError(day);
  }

  function removeRange(day: BranchDay, index: number, pointerType: PointerType) {
    const ranges = values[day].ranges;
    // Only a keyboard press loses focus to the page when its button unmounts; moving a pointer or
    // touch user's focus into a time field would pop the on-screen keyboard unasked.
    rangeToFocusRef.current =
      pointerType === "keyboard" || pointerType === "virtual"
        ? ((ranges[index + 1] ?? ranges[index - 1])?.id ?? null)
        : null;
    setValues((current) => {
      if (current[day].ranges.length <= 1) {
        return current;
      }
      return {
        ...current,
        [day]: {
          ...current[day],
          ranges: current[day].ranges.filter((_, rangeIndex) => rangeIndex !== index),
        },
      };
    });
    clearFieldError(day);
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

  function rangeTimeField(
    day: BranchDay,
    index: number,
    part: "opensAt" | "closesAt",
    errorId: string | undefined,
  ) {
    const label = branchMessages.rangeFieldLabel({
      day: branchMessages.dayLabels[day],
      index: index + 1,
      part,
    });
    return (
      <div className="w-[5.5rem]">
        <TextField
          kind="plain-text"
          label={label}
          labelVisuallyHidden
          value={values[day].ranges[index]?.[part] ?? ""}
          onChange={(value) => setRangeValue(day, index, part, value)}
          {...(errorId !== undefined ? { invalid: true, errorMessageId: errorId } : {})}
        />
      </div>
    );
  }

  function dayRow(day: BranchDay) {
    const dayLabel = branchMessages.dayLabels[day];
    const dayLower = dayLabel.toLocaleLowerCase("es-AR");
    const dayValues = values[day];
    const error = fieldErrors[day];
    const errorId = `${hoursErrorIdPrefix}-${day}`;
    const fieldErrorId = error !== undefined ? errorId : undefined;
    const atCap = dayValues.ranges.length >= BRANCH_HOURS_RANGES_PER_DAY_MAX;
    return (
      <div key={day} className="flex flex-col gap-2 border-line border-t py-3">
        <div className="flex flex-wrap items-start gap-4">
          <div
            className={`flex ${backofficeFieldHeightClassName} w-[8.75rem] shrink-0 items-center`}
          >
            <p className="font-semibold text-ink">{dayLabel}</p>
          </div>
          <div
            className={`flex ${backofficeFieldHeightClassName} w-[6.25rem] shrink-0 items-center`}
          >
            <Checkbox
              isSelected={dayValues.closed}
              onChange={(closed) => setDayClosed(day, closed)}
            >
              <span aria-hidden="true">{branchMessages.closedLabel}</span>
              <span className="sr-only">{branchMessages.closedAria({ day: dayLabel })}</span>
            </Checkbox>
          </div>
          {!dayValues.closed && (
            <div className="flex flex-1 flex-wrap items-start gap-4">
              {dayValues.ranges.map((range, index) => (
                <div
                  key={range.id}
                  ref={(element) => {
                    if (element === null) {
                      rangeElementsRef.current.delete(range.id);
                    } else {
                      rangeElementsRef.current.set(range.id, element);
                    }
                  }}
                  className="flex items-center gap-2"
                >
                  {rangeTimeField(day, index, "opensAt", fieldErrorId)}
                  <span aria-hidden="true" className="text-ink">
                    {branchMessages.rangeSeparator}
                  </span>
                  {rangeTimeField(day, index, "closesAt", fieldErrorId)}
                  {dayValues.ranges.length > 1 && (
                    <IconButton
                      icon={<Trash2 />}
                      aria-label={branchMessages.removeRangeAria({
                        day: dayLower,
                        index: index + 1,
                      })}
                      onPress={(event) => removeRange(day, index, event.pointerType)}
                    />
                  )}
                </div>
              ))}
              {!atCap && (
                <div className={`flex ${backofficeFieldHeightClassName} items-center`}>
                  <IconButton
                    icon={<Plus />}
                    aria-label={branchMessages.addRangeAria({ day: dayLower })}
                    onPress={() => addRange(day)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {error !== undefined && (
          <p id={errorId} className="text-sm font-normal text-status-error-ui">
            {error}
          </p>
        )}
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
          <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface-white p-4">
            <h2 className="mb-2 font-bold text-brand-blue-strong text-lg">
              {branchMessages.hoursHeading}
            </h2>
            {BRANCH_DAYS.map((day) => dayRow(day))}
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
