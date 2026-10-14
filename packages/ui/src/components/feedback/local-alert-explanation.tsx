import { type LocalAlertSubject, localAlertText } from "../../messages/local-alert-texts";

export type LocalAlertExplanationProps = LocalAlertSubject;

export function LocalAlertExplanation(props: LocalAlertExplanationProps) {
  const text = localAlertText(props);
  return (
    <>
      <p className="text-text text-body">{text.meaning}</p>
      <div className="flex flex-col gap-1">
        <p className="font-bold text-text text-detail">Qué hacer</p>
        <p className="text-text text-body">{text.whatToDo}</p>
      </div>
    </>
  );
}
