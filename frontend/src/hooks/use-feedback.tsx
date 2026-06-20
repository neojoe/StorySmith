import { App, Button, Input } from "antd";
import { CheckCircle2, Info, OctagonAlert, TriangleAlert } from "lucide-react";
import { useState } from "react";

type NoticeTone = "success" | "info" | "warning" | "error";

interface ConfirmOptions {
  title: string;
  content: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ChoiceItem {
  key: string;
  label: string;
  description?: string;
}

interface ChooseOptions {
  title: string;
  content: string;
  cancelText?: string;
  choices: ChoiceItem[];
}

interface PromptOptions {
  title: string;
  content?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  okText?: string;
  cancelText?: string;
  maxLength?: number;
  validator?: (value: string) => string | null;
}

const ICON_MAP = {
  success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
  warning: <TriangleAlert className="h-5 w-5 text-amber-500" />,
  error: <OctagonAlert className="h-5 w-5 text-red-500" />,
} as const;

function PromptContent({
  label,
  content,
  initialValue = "",
  placeholder,
  maxLength,
  onValueChange,
}: {
  label?: string;
  content?: string;
  initialValue?: string;
  placeholder?: string;
  maxLength?: number;
  onValueChange: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <div className="space-y-3 pt-1">
      {content ? <div className="text-sm leading-6 text-neutral-500">{content}</div> : null}
      <div className="space-y-1.5">
        {label ? (
          <div className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{label}</div>
        ) : null}
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            onValueChange(next);
          }}
          onPressEnter={(e) => {
            const form = e.currentTarget.closest(".ant-modal")?.querySelector(".ant-btn-primary");
            if (form instanceof HTMLElement) {
              form.click();
            }
          }}
        />
      </div>
    </div>
  );
}

export function useFeedback() {
  const { notification, modal } = App.useApp();

  const notify = (tone: NoticeTone, title: string, description?: string) => {
    notification[tone]({
      message: title,
      description,
      placement: "topRight",
      duration: tone === "error" ? 5 : 3.2,
      icon: ICON_MAP[tone],
      showProgress: true,
      pauseOnHover: true,
    });
  };

  const confirm = ({
    title,
    content,
    okText = "确认",
    cancelText = "取消",
    danger = false,
  }: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      const instance = modal.confirm({
        centered: true,
        closable: true,
        maskClosable: true,
        width: 440,
        title,
        content: <div className="pt-1 text-sm leading-6 text-neutral-500">{content}</div>,
        icon: danger ? ICON_MAP.error : ICON_MAP.warning,
        okText,
        cancelText,
        okButtonProps: {
          danger,
        },
        onOk: () => {
          resolve(true);
          instance.destroy();
        },
        onCancel: () => {
          resolve(false);
          instance.destroy();
        },
      });
    });

  const choose = ({
    title,
    content,
    cancelText = "取消",
    choices,
  }: ChooseOptions) =>
    new Promise<string | null>((resolve) => {
      let settled = false;
      let instance: { destroy: () => void } | null = null;

      const close = (value: string | null) => {
        if (settled) return;
        settled = true;
        resolve(value);
        instance?.destroy();
      };

      instance = modal.confirm({
        centered: true,
        closable: true,
        maskClosable: true,
        width: 560,
        title,
        icon: ICON_MAP.warning,
        okButtonProps: { style: { display: "none" } },
        cancelButtonProps: { style: { display: "none" } },
        content: (
          <div className="space-y-4 pt-1">
            <div className="text-sm leading-6 text-neutral-500">{content}</div>
            <div className="space-y-2">
              {choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => close(choice.key)}
                  className="w-full rounded-lg border border-neutral-200 px-4 py-3 text-left transition hover:border-primary-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-primary-700 dark:hover:bg-neutral-900"
                >
                  <div className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {choice.label}
                  </div>
                  {choice.description ? (
                    <div className="mt-1 text-xs leading-5 text-neutral-500">
                      {choice.description}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ),
        footer: (
          <div className="flex items-center justify-end gap-2">
            <Button onClick={() => close(null)}>{cancelText}</Button>
          </div>
        ),
        onCancel: () => close(null),
      });
    });

  const prompt = ({
    title,
    content,
    label = "请输入内容",
    initialValue = "",
    placeholder,
    okText = "保存",
    cancelText = "取消",
    maxLength,
    validator,
  }: PromptOptions) =>
    new Promise<string | null>((resolve) => {
      let currentValue = initialValue;
      const instance = modal.confirm({
        centered: true,
        closable: true,
        maskClosable: true,
        width: 480,
        title,
        icon: ICON_MAP.info,
        okText,
        cancelText,
        content: (
          <PromptContent
            label={label}
            content={content}
            initialValue={initialValue}
            placeholder={placeholder}
            maxLength={maxLength}
            onValueChange={(value) => {
              currentValue = value;
            }}
          />
        ),
        onOk: () => {
          const trimmed = currentValue.trim();
          const error = validator?.(trimmed);
          if (error) {
            notify("warning", "请先修正输入内容", error);
            return Promise.reject(new Error(error));
          }
          resolve(trimmed);
          instance.destroy();
          return Promise.resolve();
        },
        onCancel: () => {
          resolve(null);
          instance.destroy();
        },
      });
    });

  return {
    success: (title: string, description?: string) => notify("success", title, description),
    info: (title: string, description?: string) => notify("info", title, description),
    warning: (title: string, description?: string) => notify("warning", title, description),
    error: (title: string, description?: string) => notify("error", title, description),
    confirm,
    choose,
    prompt,
  };
}
