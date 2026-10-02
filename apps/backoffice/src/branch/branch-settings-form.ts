import { type BranchSettingsEditBody, branchSettingsEditBodySchema } from "@purosur/contracts";
import { failedRules } from "../platform/failed-rules";
import { schemaLimit } from "../platform/schema-limit";
import type { BranchDay, BranchSettings } from "./branch-settings-api";

export type RangeValues = { id: number; opensAt: string; closesAt: string };

export type DayValues = { closed: boolean; ranges: RangeValues[] };

export type BranchSettingsValues = Record<BranchDay, DayValues> & {
  address: string;
  whatsappNumber: string;
  instagramHandle: string;
  expiringLotAlertDays: string;
  unreviewedPriceAlertDays: string;
  goodConditionReturnDays: string;
  version: number;
};

let nextRangeId = 0;

export function emptyRange(): RangeValues {
  nextRangeId += 1;
  return { id: nextRangeId, opensAt: "", closesAt: "" };
}

const CLOSED_DAY: DayValues = { closed: true, ranges: [] };

export const EMPTY_VALUES: BranchSettingsValues = {
  address: "",
  whatsappNumber: "",
  instagramHandle: "",
  monday: CLOSED_DAY,
  tuesday: CLOSED_DAY,
  wednesday: CLOSED_DAY,
  thursday: CLOSED_DAY,
  friday: CLOSED_DAY,
  saturday: CLOSED_DAY,
  sunday: CLOSED_DAY,
  expiringLotAlertDays: "",
  unreviewedPriceAlertDays: "",
  goodConditionReturnDays: "",
  version: 0,
};

function dayValuesFrom(ranges: BranchSettings["hours"][BranchDay]): DayValues {
  return ranges.length === 0
    ? CLOSED_DAY
    : { closed: false, ranges: ranges.map((range) => ({ ...emptyRange(), ...range })) };
}

export function valuesFrom(settings: BranchSettings): BranchSettingsValues {
  return {
    address: settings.address,
    whatsappNumber: settings.whatsappNumber,
    instagramHandle: settings.instagramHandle,
    monday: dayValuesFrom(settings.hours.monday),
    tuesday: dayValuesFrom(settings.hours.tuesday),
    wednesday: dayValuesFrom(settings.hours.wednesday),
    thursday: dayValuesFrom(settings.hours.thursday),
    friday: dayValuesFrom(settings.hours.friday),
    saturday: dayValuesFrom(settings.hours.saturday),
    sunday: dayValuesFrom(settings.hours.sunday),
    expiringLotAlertDays: String(settings.expiringLotAlertDays),
    unreviewedPriceAlertDays: String(settings.unreviewedPriceAlertDays),
    goodConditionReturnDays: String(settings.goodConditionReturnDays),
    version: settings.version,
  };
}

function wireTime(text: string): string {
  return text.trim().padStart(5, "0");
}

function wireHours({ closed, ranges }: DayValues): BranchSettingsEditBody["monday_hours"] {
  return closed
    ? []
    : ranges.map((range) => ({
        opens_at: wireTime(range.opensAt),
        closes_at: wireTime(range.closesAt),
      }));
}

function wireDays(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

export function requestFrom(values: BranchSettingsValues): BranchSettingsEditBody {
  return {
    address: values.address,
    whatsapp_number: values.whatsappNumber,
    instagram_handle: values.instagramHandle,
    monday_hours: wireHours(values.monday),
    tuesday_hours: wireHours(values.tuesday),
    wednesday_hours: wireHours(values.wednesday),
    thursday_hours: wireHours(values.thursday),
    friday_hours: wireHours(values.friday),
    saturday_hours: wireHours(values.saturday),
    sunday_hours: wireHours(values.sunday),
    expiring_lot_alert_days: wireDays(values.expiringLotAlertDays),
    unreviewed_price_alert_days: wireDays(values.unreviewedPriceAlertDays),
    good_condition_return_days: wireDays(values.goodConditionReturnDays),
    version: values.version,
  };
}

export const REQUEST_FIELDS = {
  address: "address",
  whatsapp_number: "whatsappNumber",
  instagram_handle: "instagramHandle",
  monday_hours: "monday",
  tuesday_hours: "tuesday",
  wednesday_hours: "wednesday",
  thursday_hours: "thursday",
  friday_hours: "friday",
  saturday_hours: "saturday",
  sunday_hours: "sunday",
  expiring_lot_alert_days: "expiringLotAlertDays",
  unreviewed_price_alert_days: "unreviewedPriceAlertDays",
  good_condition_return_days: "goodConditionReturnDays",
  version: null,
} as const;

export const HOURS_RANGES_PER_DAY_MAX = schemaLimit(
  branchSettingsEditBodySchema.shape.monday_hours.meta()?.["maxLength"],
);

type TextField = "address" | "whatsappNumber" | "instagramHandle";

const TEXT_WIRE_FIELDS = {
  address: "address",
  whatsappNumber: "whatsapp_number",
  instagramHandle: "instagram_handle",
} as const;

function textMessage(field: TextField, review: string) {
  const shape = branchSettingsEditBodySchema.shape[TEXT_WIRE_FIELDS[field]];
  return (values: BranchSettingsValues): string =>
    shape.safeParse(values[field]).success
      ? review
      : `Ingresá como mucho ${schemaLimit(shape.maxLength)} caracteres.`;
}

type DaysField = "expiringLotAlertDays" | "unreviewedPriceAlertDays" | "goodConditionReturnDays";

const DAYS_WIRE_FIELDS = {
  expiringLotAlertDays: "expiring_lot_alert_days",
  unreviewedPriceAlertDays: "unreviewed_price_alert_days",
  goodConditionReturnDays: "good_condition_return_days",
} as const;

function daysMessage(field: DaysField) {
  return (values: BranchSettingsValues): string => {
    const result = branchSettingsEditBodySchema.shape[DAYS_WIRE_FIELDS[field]].safeParse(
      wireDays(values[field]),
    );
    if (result.success) {
      return "Revisá el número de días.";
    }
    return result.error.issues.some((issue) => issue.code === "too_big")
      ? "Ingresá un número de días más chico."
      : "Ingresá un número entero de 0 días o más.";
  };
}

function hoursMessage(day: BranchDay) {
  const shape = branchSettingsEditBodySchema.shape[`${day}_hours`];
  return (values: BranchSettingsValues): string => {
    const rules = failedRules(shape, wireHours(values[day]));
    if (rules.includes("time_format")) {
      return "Ingresá la hora como 9:00 o 21:30.";
    }
    if (rules.includes("range_order")) {
      return "La hora de cierre tiene que ser posterior a la de apertura.";
    }
    if (rules.includes("range_overlap")) {
      return "Los horarios de un mismo día no se pueden superponer.";
    }
    return "Revisá los horarios de este día.";
  };
}

export const MESSAGES = {
  address: textMessage("address", "Revisá la dirección."),
  whatsappNumber: textMessage("whatsappNumber", "Revisá el número de WhatsApp."),
  instagramHandle: textMessage("instagramHandle", "Revisá el usuario de Instagram."),
  monday: hoursMessage("monday"),
  tuesday: hoursMessage("tuesday"),
  wednesday: hoursMessage("wednesday"),
  thursday: hoursMessage("thursday"),
  friday: hoursMessage("friday"),
  saturday: hoursMessage("saturday"),
  sunday: hoursMessage("sunday"),
  expiringLotAlertDays: daysMessage("expiringLotAlertDays"),
  unreviewedPriceAlertDays: daysMessage("unreviewedPriceAlertDays"),
  goodConditionReturnDays: daysMessage("goodConditionReturnDays"),
};
