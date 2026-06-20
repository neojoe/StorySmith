import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, className, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-md border bg-white px-3 py-2 text-sm shadow-xs",
            "placeholder:text-neutral-400",
            "transition-colors duration-150 resize-y",
            "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500",
            error
              ? "border-danger-500 focus:ring-danger-500"
              : "border-neutral-300 dark:border-neutral-600",
            className,
          )}
          {...props}
        />

        {error && <p className="text-xs text-danger-500">{error}</p>}
        {hint && !error && (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";
