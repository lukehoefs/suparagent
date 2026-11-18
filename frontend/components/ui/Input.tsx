import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export { Select } from "./Select";
export type { SelectProps, SelectOption, SelectGroup } from "./Select";

// One look for every text control: the design's solid --border-strong edge (every input in the
// handoff), darker on hover. 16 px on touch screens stops iOS zooming on focus.
export const CONTROL =
  "w-full rounded-field border border-line-strong bg-raised px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-(--dur-fast) " +
  "hover:border-ink/30 focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger touch:text-base";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  // 36 px on desktop, 44 px on touch screens (design tokens control-lg and control-touch).
  return <input ref={ref} className={cn(CONTROL, "h-control touch:h-touch", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(CONTROL, "resize-y", className)} {...rest} />;
});

// Label, control, hint and error wired together. `children` receives the ids to spread on the control.
// The label is the design's form label: 12 px, medium, muted, so it sits quieter than the value.
// `labelClassName` adjusts it where a screen needs another style.
export function Field({
  label,
  hint,
  error,
  className,
  labelClassName,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  labelClassName?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => ReactNode;
}) {
  const id = useId();
  const note = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={cn("text-small font-medium text-muted", labelClassName)}>{label}</label>
      {children({ id, "aria-describedby": note, "aria-invalid": error ? true : undefined })}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
