import { KeyRound } from "lucide-react";
import { ScreenLink } from "./screen-link";

export function ReadyScreen() {
  return (
    <main>
      <p>Puro Sur está listo</p>
      <ScreenLink
        to="/pin-code-redemption"
        icon={<KeyRound />}
        label="Tengo un código para cambiar el PIN"
      />
    </main>
  );
}
