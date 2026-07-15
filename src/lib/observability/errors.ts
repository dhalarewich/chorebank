import { logError } from "@/lib/server/logger";

const errorAlertWebhookUrl = process.env.ERROR_ALERT_WEBHOOK_URL?.trim();

export function reportError(error: unknown, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const stack = error instanceof Error ? error.stack : undefined;

  logError(message, {
    ...context,
    stack,
  });

  if (!errorAlertWebhookUrl) return;

  const payload = {
    source: "chorebank",
    level: "error",
    message,
    context: context ?? {},
    at: new Date().toISOString(),
  };

  void fetch(errorAlertWebhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((alertError) => {
    logError("Error alert dispatch failed", {
      originalMessage: message,
      alertWebhookConfigured: true,
      alertError: alertError instanceof Error ? alertError.message : String(alertError),
    });
  });
}
