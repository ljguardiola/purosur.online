import { type LocalAlertSubject, localAlertText } from "../../messages/local-alert-texts";

export type LocalAlertExplanationProps = LocalAlertSubject & {
  title?: boolean;
};

export function LocalAlertExplanation(props: LocalAlertExplanationProps) {
  const { title = false } = props;
  const text = localAlertText(props);
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
