import { useEffect, useRef, useState } from "react";
import { Form, Input, Modal, Spin, Tag } from "antd";
import { CheckCircle2, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { platformService, type LoginStatus } from "@/services/platform-service";
import { usePlatformStore, PLATFORM_USER_IDS } from "@/stores/platform-store";
import { useQueryClient } from "@tanstack/react-query";
import { PLATFORM_LABELS, type PlatformType } from "@/types/platform";

interface Props {
  open: boolean;
  onClose: () => void;
  platform: PlatformType;
}

type Step = "loading" | "qrcode" | "polling" | "success" | "phone";

function parseTimeoutMs(raw?: string) {
  if (!raw) return 60_000;
  const match = raw.match(/(?:(\d+)m)?(?:(\d+)s)?/i);
  if (!match) return 60_000;
  const minutes = Number(match[1] ?? 0);
  const seconds = Number(match[2] ?? 0);
  const totalMs = (minutes * 60 + seconds) * 1000;
  return totalMs > 0 ? totalMs : 60_000;
}

export function QrcodeLoginModal({ open, onClose, platform }: Props) {
  const queryClient = useQueryClient();
  const { setPlatformConnected } = usePlatformStore();
  const [form] = Form.useForm();
  const userId = PLATFORM_USER_IDS[platform];
  const platformLabel = PLATFORM_LABELS[platform];
  const isQimao = platform === "qimao";

  const [step, setStep] = useState<Step>("loading");
  const [qrcodeImg, setQrcodeImg] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [user, setUser] = useState<Pick<LoginStatus, "username" | "avatar">>();
  const [timeoutText, setTimeoutText] = useState("60s");
  const [sendingCode, setSendingCode] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await platformService.checkLoginStatus(platform, userId);
        if (status.is_logged_in) {
          stopPolling();
          setUser({ username: status.username, avatar: status.avatar });
          setPlatformConnected(platform, status.username ?? `${platformLabel}用户`, status.avatar);
          queryClient.invalidateQueries({ queryKey: [`${platform}-login-status`] });
          setStep("success");
        }
      } catch {
        // 静默忽略轮询错误
      }
    }, 2500);
  };

  const fetchQrcode = async () => {
    if (isQimao) {
      setError("");
      setStep("phone");
      return;
    }
    setStep("loading");
    setError("");
    try {
      const res = await platformService.getQrcode(platform, userId);
      if (res.is_logged_in) {
        const status = await platformService.checkLoginStatus(platform, userId);
        setUser({ username: status.username, avatar: status.avatar });
        setPlatformConnected(platform, status.username ?? `${platformLabel}用户`, status.avatar);
        queryClient.invalidateQueries({ queryKey: [`${platform}-login-status`] });
        setStep("success");
      } else if (res.img) {
        setQrcodeImg(res.img);
        setTimeoutText(res.timeout || "60s");
        setStep("qrcode");
        startPolling();
      } else {
        setError("获取二维码失败，请重试");
        setStep("loading");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`请求失败：${msg}`);
      setStep("loading");
    }
  };

  useEffect(() => {
    if (open) {
      setError("");
      form.setFieldsValue({ phone: "", code: "" });
      void fetchQrcode();
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, platform]);

  // 超时后变为 qrcode→loading
  useEffect(() => {
    if (step !== "qrcode") return;
    const t = setTimeout(() => {
      stopPolling();
      setStep("loading");
      setError("二维码已过期，请刷新");
    }, parseTimeoutMs(timeoutText));
    return () => clearTimeout(t);
  }, [step, timeoutText]);

  const handleClose = () => {
    stopPolling();
    onClose();
  };

  const finishQimaoLogin = (status?: LoginStatus) => {
    setUser({ username: status?.username, avatar: status?.avatar });
    setPlatformConnected(platform, status?.username ?? `${platformLabel}用户`, status?.avatar);
    queryClient.invalidateQueries({ queryKey: [`${platform}-login-status`] });
    setStep("success");
  };

  const handleSendCode = async () => {
    try {
      const { phone } = await form.validateFields(["phone"]);
      setError("");
      setSendingCode(true);
      const res = await platformService.sendQimaoSmsCode(userId, phone as string);
      if (!res.success) {
        setError(res.message || "验证码发送失败");
        return;
      }
      setError(res.message || "验证码已发送");
    } catch (e: unknown) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSendingCode(false);
    }
  };

  const handlePhoneLogin = async () => {
    try {
      const values = await form.validateFields(["phone", "code"]);
      setError("");
      setLoggingIn(true);
      const res = await platformService.loginQimaoWithPhone(userId, values.phone as string, values.code as string);
      if (!res.success) {
        setError(res.message || "登录失败");
        return;
      }
      finishQimaoLogin(res.user);
    } catch (e: unknown) {
      if (e && typeof e === "object" && "errorFields" in e) return;
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoggingIn(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      centered
      width={360}
      title={
        <div className="flex items-center gap-2 text-base font-semibold">
          <Smartphone className="h-4 w-4 text-primary-600" />
          {platformLabel} · {isQimao ? "手机号登录" : "扫码登录"}
        </div>
      }
    >
      <div className="flex flex-col items-center gap-5 pb-4 pt-2">
        {step === "loading" && (
          <div className="flex h-48 flex-col items-center justify-center gap-3">
            {error ? (
              <>
                <p className="text-sm text-danger-500">{error}</p>
                <Button size="sm" variant="outline" onClick={fetchQrcode}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新获取
                </Button>
              </>
            ) : (
              <Spin tip="正在获取二维码…" />
            )}
          </div>
        )}

        {(step === "qrcode" || step === "polling") && (
          <>
            <div className="relative rounded-lg border-2 border-primary-100 bg-white p-2 shadow-md dark:border-primary-900 dark:bg-neutral-900">
              <img src={qrcodeImg} alt="扫码登录" className="h-44 w-44 object-contain" />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                使用{platformLabel}对应客户端扫码
              </p>
              <p className="text-xs text-neutral-400">二维码有效期 {timeoutText} · 到期后可重新获取</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-neutral-400">
              <Spin size="small" />
              等待扫码中…
            </div>
          </>
        )}

        {step === "phone" && (
          <div className="w-full space-y-4">
            <div className="rounded-lg bg-neutral-50 p-3 text-xs leading-5 text-neutral-500 dark:bg-neutral-800/50">
              输入七猫账号手机号，先获取验证码，再完成登录。若发送验证码时触发滑块校验，后端会自动尝试处理。
            </div>
            <Form form={form} layout="vertical">
              <Form.Item
                label="手机号"
                name="phone"
                rules={[
                  { required: true, message: "请输入手机号" },
                  { pattern: /^1\d{10}$/, message: "请输入正确的 11 位手机号" },
                ]}
              >
                <Input placeholder="请输入手机号" maxLength={11} />
              </Form.Item>
              <Form.Item label="验证码" required>
                <div className="flex gap-2">
                  <Form.Item
                    name="code"
                    noStyle
                    rules={[
                      { required: true, message: "请输入验证码" },
                      { min: 4, message: "请输入正确的验证码" },
                    ]}
                  >
                    <Input placeholder="请输入验证码" maxLength={8} />
                  </Form.Item>
                  <Button type="button" variant="outline" onClick={handleSendCode} loading={sendingCode}>
                    发送验证码
                  </Button>
                </div>
              </Form.Item>
            </Form>
            {error && (
              <p className={`text-sm ${error.includes("成功") || error.includes("已发送") ? "text-success-600" : "text-danger-500"}`}>
                {error}
              </p>
            )}
            <Button className="w-full" onClick={handlePhoneLogin} loading={loggingIn}>
              登录
            </Button>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 dark:bg-success-900/20">
              <CheckCircle2 className="h-9 w-9 text-success-500" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">
                登录成功
              </p>
              {user?.username && (
                <p className="mt-1 text-sm text-neutral-500">
                  欢迎，{user.username}
                </p>
              )}
            </div>
            <Tag color="success" className="px-3 py-1">
              账号已绑定
            </Tag>
            <Button className="w-full" onClick={handleClose}>
              完成
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
