import { Button, InlineNotice } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound } from "lucide-react";

type SignInLockoutProps = { consecutiveFailures: number } & (
  | { backLabel: string; onBack: () => void }
  | { backLabel?: undefined; onBack?: undefined }
);

export function SignInLockout({ consecutiveFailures, backLabel, onBack }: SignInLockoutProps) {
  const navigate = useNavigate();
  const keyboardOnly = onBack === undefined;

  return (
    <>
      <p className="text-body text-text">
        Se equivocó {consecutiveFailures} veces seguidas con el PIN.
      </p>
      <InlineNotice
        tone="warning"
        icon={<KeyRound />}
        title="Se vuelve a entrar con un código"
        description="Alguien con permiso lo genera desde el backoffice. Con el código se elige un PIN nuevo en esta caja, con internet."
      />
      <Button
        fullWidth
        icon={<KeyRound />}
        iconPosition={keyboardOnly ? "start" : "end"}
        {...(keyboardOnly ? { keycap: "F3" as const } : {})}
        onPress={() => navigate({ to: "/pin-code-redemption" })}
      >
        Tengo un código
      </Button>
      {keyboardOnly ? null : (
        <div className="self-start">
          <Button variant="text" icon={<ArrowLeft />} onPress={onBack}>
            {backLabel}
          </Button>
        </div>
      )}
    </>
  );
}
