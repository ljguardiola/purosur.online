import { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "@purosur/domain";
import { Checkbox, IconButton, type IconButtonProps, TextField } from "@purosur/ui";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useFieldContext } from "../platform/cloud-form-context";
import { SharedFieldError } from "../platform/cloud-form-fields";
import type { BranchDay } from "./branch-settings-api";
import { type DayValues, emptyRange } from "./branch-settings-form";

type PointerType = Parameters<NonNullable<IconButtonProps["onPress"]>>[0]["pointerType"];

const DAY_LABELS = {
  monday: "Lunes",
  tuesday: "Martes",
  wednesday: "Miércoles",
  thursday: "Jueves",
  friday: "Viernes",
  saturday: "Sábado",
  sunday: "Domingo",
} satisfies Record<BranchDay, string>;

type BranchDayRowProps = { day: BranchDay };

export function BranchDayRow({ day }: BranchDayRowProps) {
  const field = useFieldContext<DayValues>();
  const dayValues = field.state.value;
  const dayLabel = DAY_LABELS[day];
  const dayLower = dayLabel.toLocaleLowerCase("es-AR");
  const atCap = dayValues.ranges.length >= BRANCH_HOURS_RANGES_PER_DAY_MAX;

  // Adding/removing a range can unmount the button that did it, dropping keyboard focus to the
  // page; focus lands on the added range, or the range that takes the removed one's place, instead.
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

  function setClosed(closed: boolean) {
    const ranges = !closed && dayValues.ranges.length === 0 ? [emptyRange()] : dayValues.ranges;
    field.handleChange({ closed, ranges });
  }

  function setRangeTime(index: number, part: "opensAt" | "closesAt", value: string) {
    field.handleChange({
      ...dayValues,
      ranges: dayValues.ranges.map((range, rangeIndex) =>
        rangeIndex === index ? { ...range, [part]: value } : range,
      ),
    });
  }

  function addRange() {
    if (atCap) {
      return;
    }
    const added = emptyRange();
    rangeToFocusRef.current = added.id;
    field.handleChange({ ...dayValues, ranges: [...dayValues.ranges, added] });
  }

  function removeRange(index: number, pointerType: PointerType) {
    if (dayValues.ranges.length <= 1) {
      return;
    }
    const { ranges } = dayValues;
    // Only a keyboard press loses focus to the page when its button unmounts; moving a pointer or
    // touch user's focus into a time field would pop the on-screen keyboard unasked.
    rangeToFocusRef.current =
      pointerType === "keyboard" || pointerType === "virtual"
        ? ((ranges[index + 1] ?? ranges[index - 1])?.id ?? null)
        : null;
    field.handleChange({
      ...dayValues,
      ranges: ranges.filter((_, rangeIndex) => rangeIndex !== index),
    });
  }

  return (
    <div className="flex flex-col gap-2 border-border border-t py-3">
      <SharedFieldError>
        {(errorMessageId) => (
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex h-control-2xl w-35 shrink-0 items-center">
              <p className="font-semibold text-text">{dayLabel}</p>
            </div>
            <div className="flex h-control-2xl w-25 shrink-0 items-center">
              <Checkbox checked={dayValues.closed} onCheckedChange={setClosed}>
                <span aria-hidden="true">Cerrado</span>
                <span className="sr-only">{`${dayLabel} — Cerrado`}</span>
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
                    {(["opensAt", "closesAt"] as const).map((part) => (
                      <RangeTime
                        key={part}
                        label={`${dayLabel}, horario ${index + 1}, ${part === "opensAt" ? "abre" : "cierra"}`}
                        value={range[part]}
                        onChange={(value) => setRangeTime(index, part, value)}
                        errorMessageId={errorMessageId}
                        separator={part === "opensAt"}
                      />
                    ))}
                    {dayValues.ranges.length > 1 && (
                      <IconButton
                        icon={<Trash2 />}
                        aria-label={`Quitar el horario ${index + 1} del ${dayLower}`}
                        onPress={(event) => removeRange(index, event.pointerType)}
                      />
                    )}
                  </div>
                ))}
                {!atCap && (
                  <div className="flex h-control-2xl items-center">
                    <IconButton
                      icon={<Plus />}
                      aria-label={`Agregar un horario al ${dayLower}`}
                      onPress={addRange}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SharedFieldError>
    </div>
  );
}

type RangeTimeProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errorMessageId: string | undefined;
  separator: boolean;
};

function RangeTime({ label, value, onChange, errorMessageId, separator }: RangeTimeProps) {
  return (
    <>
      <div className="w-22">
        <TextField
          kind="plain-text"
          label={label}
          labelVisuallyHidden
          value={value}
          onChange={onChange}
          {...(errorMessageId !== undefined ? { errorMessageId } : {})}
        />
      </div>
      {separator ? (
        <span aria-hidden="true" className="text-text">
          a
        </span>
      ) : null}
    </>
  );
}
