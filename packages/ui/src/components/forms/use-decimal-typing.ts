import { useEffect, useLayoutEffect, useState } from "react";
import { applyDecimalEdit, type DecimalEdit, reformatDecimalText } from "./decimal-typing";

function editOf(event: InputEvent): DecimalEdit | undefined {
  switch (event.inputType) {
    case "insertText":
      return event.data === null ? undefined : { kind: "insert", data: event.data };
    case "insertFromPaste": {
      const data = event.dataTransfer?.getData("text/plain") ?? event.data;
      return data === null ? undefined : { kind: "insert-paste", data };
    }
    case "deleteContentBackward":
      return { kind: "delete-backward" };
    case "deleteContentForward":
      return { kind: "delete-forward" };
    default:
      return undefined;
  }
}

export function useDecimalTyping(decimals: number | undefined, onChange: (value: string) => void) {
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const [pendingCaret, setPendingCaret] = useState<{ position: number } | undefined>(undefined);

  useLayoutEffect(() => {
    if (pendingCaret !== undefined) {
      input?.setSelectionRange(pendingCaret.position, pendingCaret.position);
    }
  }, [input, pendingCaret]);

  useEffect(() => {
    if (decimals === undefined || input === null) {
      return;
    }
    const interceptEdit = (event: InputEvent) => {
      const edit = editOf(event);
      if (edit === undefined) {
        return;
      }
      event.preventDefault();
      const result = applyDecimalEdit(
        {
          text: input.value,
          selectionStart: input.selectionStart ?? input.value.length,
          selectionEnd: input.selectionEnd ?? input.value.length,
        },
        edit,
        decimals,
      );
      if (result.text !== input.value) {
        onChange(result.text);
        setPendingCaret({ position: result.caret });
      }
    };
    input.addEventListener("beforeinput", interceptEdit);
    return () => input.removeEventListener("beforeinput", interceptEdit);
  }, [input, decimals, onChange]);

  const reformatNativeChange = (value: string) => {
    if (decimals === undefined) {
      onChange(value);
      return;
    }
    const result = reformatDecimalText(value, input?.selectionStart ?? value.length, decimals);
    onChange(result.text);
    setPendingCaret({ position: result.caret });
  };

  return [setInput, reformatNativeChange] as const;
}
