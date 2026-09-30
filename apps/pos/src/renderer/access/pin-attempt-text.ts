import { plural } from "@purosur/ui";

function attemptsLeftText(attemptsLeft: number): string {
  const attempts = plural(attemptsLeft, {
    one: "Queda 1 intento",
    other: `Quedan ${attemptsLeft} intentos`,
  });
  return `${attempts} antes de que el usuario se bloquee.`;
}

export function waitDescription(secondsLeft: number, attemptsLeft: number): string {
  const instruction =
    secondsLeft > 0
      ? `Esperá ${plural(secondsLeft, { one: "1 segundo", other: `${secondsLeft} segundos` })} para volver a intentar.`
      : "Revisá el PIN y volvé a escribirlo.";
  return `${instruction} ${attemptsLeftText(attemptsLeft)}`;
}
