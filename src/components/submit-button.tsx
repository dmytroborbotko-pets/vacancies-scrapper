"use client";

import { useFormStatus } from "react-dom";
import { Spinner } from "@/components/spinner";

// Must be a descendant of the <form> it reports on (useFormStatus reads the
// nearest parent form's pending state) — that's why this is a separate
// client component rather than inlined in the (server) page.
export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`${className ?? ""} inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60 ${pending ? "cursor-wait" : ""}`}
    >
      {pending && <Spinner className="h-3.5 w-3.5" />}
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
