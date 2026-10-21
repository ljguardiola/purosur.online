import { FileText, Upload } from "lucide-react";
import { useId } from "react";
import { formatBytes } from "../../messages/formatters";
import { iconSlotClassName } from "../shared/icon";
import { type FieldErrorProps, fieldError } from "./field-error";
import {
  fieldLabelClassName,
  fieldWrapperGapClassName,
  requiredFieldLabelSuffixClassName,
  useFieldSize,
} from "./field-size";
import { fieldErrorClassName, fieldHelperClassName } from "./field-styles";

export type FilePickerProps = FieldErrorProps & {
  label: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  chooseText: string;
  chooseAnotherText: string;
  description?: string;
  disabled?: boolean;
  required?: boolean;
};

const areaClassName =
  "flex flex-col items-center gap-3 rounded-lg border-2 border-dashed bg-surface-subtle p-4 " +
  "has-focus-visible:focus-ring";

const areaStateClassName = {
  enabled: "cursor-pointer hover:bg-surface-soft",
  disabled: "cursor-default opacity-disabled",
} as const;

const actionClassName = "text-detail font-bold text-text-accent";

export function FilePicker(props: FilePickerProps) {
  const {
    label,
    accept,
    file,
    onChange,
    chooseText,
    chooseAnotherText,
    description,
    disabled = false,
    required = false,
  } = props;
  const { invalid, errorMessage, errorMessageId } = fieldError(props);
  const size = useFieldSize();
  const labelId = useId();
  const actionId = useId();
  const chosenId = useId();
  const descriptionId = useId();
  const ownErrorId = useId();

  const labelClassName = required
    ? `${fieldLabelClassName[size]} ${requiredFieldLabelSuffixClassName}`
    : fieldLabelClassName[size];
  const showsDescription = description !== undefined && !invalid;
  const describedBy = [
    file === null ? undefined : chosenId,
    showsDescription ? descriptionId : undefined,
    errorMessage === undefined ? errorMessageId : ownErrorId,
  ]
    .filter((id) => id !== undefined)
    .join(" ");

  return (
    <div className={`flex flex-col ${fieldWrapperGapClassName[size]}`}>
      <span id={labelId} className={labelClassName}>
        {label}
      </span>
      <label
        className={`${areaClassName} ${invalid ? "border-error" : "border-action"} ${
          disabled ? areaStateClassName.disabled : areaStateClassName.enabled
        }`}
      >
        <input
          type="file"
          className="sr-only"
          accept={accept}
          disabled={disabled}
          aria-labelledby={`${labelId} ${actionId}`}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          aria-invalid={invalid}
          onChange={(event) => {
            const chosen = event.target.files?.[0] ?? null;
            event.target.value = "";
            onChange(chosen);
          }}
        />
        {file === null ? (
          <span className="flex items-center gap-2 py-2">
            <span aria-hidden="true" className={`${iconSlotClassName.lg} text-text-accent`}>
              <Upload />
            </span>
            <span id={actionId} className={actionClassName}>
              {chooseText}
            </span>
          </span>
        ) : (
          <>
            <span
              id={chosenId}
              className="flex max-w-full items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span aria-hidden="true" className={`${iconSlotClassName.lg} text-text-accent`}>
                <FileText />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body font-bold text-text">{file.name}</span>
                <span className="text-detail text-text-subtle">{formatBytes(file.size)}</span>
              </span>
            </span>
            <span id={actionId} className={actionClassName}>
              {chooseAnotherText}
            </span>
          </>
        )}
      </label>
      {showsDescription ? (
        <p id={descriptionId} className={fieldHelperClassName}>
          {description}
        </p>
      ) : null}
      {errorMessage === undefined ? null : (
        <p id={ownErrorId} className={fieldErrorClassName}>
          {errorMessage}
        </p>
      )}
    </div>
  );
}
