import type { KeyName } from "@purosur/ui";
import type { ReactNode, RefObject } from "react";
import { createContext, useContext, useEffect, useRef, useState } from "react";

export type KeyBinding = {
  key: KeyName;
  label?: string;
  run: (pressed: string) => void;
  enabled?: boolean;
  whileTyping?: boolean;
};

export type KeyOptions = {
  modal?: boolean;
  active?: boolean;
  within?: RefObject<Element | null>;
  fallback?: boolean;
};

export type LegendItem = { keyName: KeyName; label: string };

type Registration = {
  order: number;
  modal: boolean;
  fallback: boolean;
  within: RefObject<Element | null> | undefined;
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

function matches(
  key: KeyName,
  { key: pressed, code }: Pick<KeyboardEvent, "key" | "code">,
): boolean {
  switch (key) {
    case "NumpadAdd":
    case "NumpadSubtract":
      return code === key;
    case "NumpadAddSubtract":
      return code === "NumpadAdd" || code === "NumpadSubtract";
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

function reaches(registration: Registration, target: EventTarget | null): boolean {
  if (registration.within === undefined) {
    return true;
  }
  const scope = registration.within.current;
  return scope !== null && target instanceof Node && scope.contains(target);
}

function candidatesFor(
  registrations: readonly Registration[],
  event: KeyboardEvent,
  fallback: boolean,
): Registration[] {
  const modals = registrations.filter((registration) => registration.modal);
  if (modals.length > 0) {
    return fallback ? [] : modals.slice(-1);
  }
  if (isInsideDialog(event.target)) {
    return [];
  }
  const reaching = registrations
    .filter(
      (registration) => registration.fallback === fallback && reaches(registration, event.target),
    )
    .reverse();
  return [
    ...reaching.filter((registration) => registration.within !== undefined),
    ...reaching.filter((registration) => registration.within === undefined),
  ];
}

function bindingFor(
  candidates: readonly Registration[],
  event: KeyboardEvent,
  typing: boolean,
): KeyBinding | undefined {
  for (const registration of candidates) {
    const found = registration.bindings.current.find(
      (binding) =>
        binding.enabled !== false &&
        (!typing || binding.whileTyping === true) &&
        matches(binding.key, event),
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
  const [registry] = useState<Registry>(() => ({
    add: (registration) => {
      counter.current += 1;
      const added = { ...registration, order: counter.current };
      registrations.current = [...registrations.current, added];
      return () => {
        registrations.current = registrations.current.filter((other) => other !== added);
      };
    },
  }));

  useEffect(() => {
    function handle(event: KeyboardEvent, fallback: boolean) {
      if ((fallback && event.defaultPrevented) || event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }
      const typing = event.key.length === 1 && isTextField(event.target);
      const candidates = candidatesFor(registrations.current, event, fallback);
      const binding = bindingFor(candidates, event, typing);
      if (binding !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        binding.run(event.key);
      }
    }
    const onScreenKey = (event: KeyboardEvent) => handle(event, false);
    const onUnhandledKey = (event: KeyboardEvent) => handle(event, true);
    window.addEventListener("keydown", onScreenKey, true);
    window.addEventListener("keydown", onUnhandledKey);
    return () => {
      window.removeEventListener("keydown", onScreenKey, true);
      window.removeEventListener("keydown", onUnhandledKey);
    };
  }, []);

  return <KeyLayerContext value={registry}>{children}</KeyLayerContext>;
}

export function useKeys(
  bindings: readonly KeyBinding[],
  { modal = false, active = true, within, fallback = false }: KeyOptions = {},
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
    return registry.add({ modal, fallback, within, bindings: latest });
  }, [registry, modal, active, fallback, within]);

  return bindings.flatMap((binding) =>
    binding.enabled !== false && binding.label !== undefined
      ? [{ keyName: binding.key, label: binding.label }]
      : [],
  );
}
