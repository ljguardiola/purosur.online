import type { KeyName } from "@purosur/ui";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";

export type KeyBinding = {
  key: KeyName;
  label?: string;
  run: (pressed: string) => void;
  enabled?: boolean;
};

export type KeyOptions = { modal?: boolean; active?: boolean };

export type LegendItem = { keyName: KeyName; label: string };

type Registration = {
  order: number;
  modal: boolean;
  bindings: { current: readonly KeyBinding[] };
};

type Registry = {
  add: (registration: Omit<Registration, "order">) => () => void;
};

const NO_REGISTRY: Registry = { add: () => () => {} };

const KeyLayerContext = createContext<Registry>(NO_REGISTRY);

const ARROWS_UP_DOWN = ["ArrowUp", "ArrowDown"];
const ARROWS_LEFT_RIGHT = ["ArrowLeft", "ArrowRight"];
const TEXT_INPUT_TYPES = ["", "text", "search", "email", "password", "number", "tel", "url"];

function matches(key: KeyName, pressed: string): boolean {
  switch (key) {
    case "Space":
      return pressed === " ";
    case "ArrowUpDown":
      return ARROWS_UP_DOWN.includes(pressed);
    case "ArrowLeftRight":
      return ARROWS_LEFT_RIGHT.includes(pressed);
    case "Digits":
      return /^[0-9]$/.test(pressed);
    default:
      return key.length === 1 ? pressed.toUpperCase() === key : pressed === key;
  }
}

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return TEXT_INPUT_TYPES.includes(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

function isInsideDialog(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest('[role="dialog"], [role="alertdialog"]') !== null
  );
}

function bindingFor(
  registrations: readonly Registration[],
  event: KeyboardEvent,
): KeyBinding | undefined {
  const modals = registrations.filter((registration) => registration.modal);
  const candidates =
    modals.length > 0
      ? modals.slice(-1)
      : isInsideDialog(event.target)
        ? []
        : registrations.toReversed();
  for (const registration of candidates) {
    const found = registration.bindings.current.find(
      (binding) => binding.enabled !== false && matches(binding.key, event.key),
    );
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function KeyLayerProvider({ children }: { children: ReactNode }) {
  const registrations = useRef<Registration[]>([]);
  const counter = useRef(0);
  const registry = useRef<Registry>({
    add: (registration) => {
      counter.current += 1;
      const added = { ...registration, order: counter.current };
      registrations.current = [...registrations.current, added];
      return () => {
        registrations.current = registrations.current.filter((other) => other !== added);
      };
    },
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      if (event.key.length === 1 && isTextField(event.target)) {
        return;
      }
      const binding = bindingFor(registrations.current, event);
      if (binding !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        binding.run(event.key);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return <KeyLayerContext value={registry.current}>{children}</KeyLayerContext>;
}

export function useKeys(
  bindings: readonly KeyBinding[],
  { modal = false, active = true }: KeyOptions = {},
): LegendItem[] {
  const registry = useContext(KeyLayerContext);
  const latest = useRef(bindings);
  useEffect(() => {
    latest.current = bindings;
  });
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    return registry.add({ modal, bindings: latest });
  }, [registry, modal, active]);

  return bindings.flatMap((binding) =>
    binding.enabled !== false && binding.label !== undefined
      ? [{ keyName: binding.key, label: binding.label }]
      : [],
  );
}
