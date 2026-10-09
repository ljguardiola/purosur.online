import { type LocalAlertKind, localAlertText } from "../../messages/local-alert-texts";

export type LocalAlertExplanationProps = {
  kind: LocalAlertKind;
  title?: boolean;
};

export function LocalAlertExplanation({ kind, title = false }: LocalAlertExplanationProps) {
  const text = localAlertText(kind);
  if (text === undefined) {
    return null;
  }
  return (
    <>
      {title ? <p className="font-bold text-text text-subheading">{text.title}</p> : null}
      <p className="text-text text-body">{text.meaning}</p>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-text text-detail">Qué hacer</p>
        <p className="text-text text-body">{text.whatToDo}</p>
      </div>
    </>
  );
}
