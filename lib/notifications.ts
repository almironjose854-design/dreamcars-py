import type { Inquiry, Settings } from "./types";

const TYPE_LABELS: Record<string, string> = {
  vehicle: "Vehículo en stock / Visita",
  consignment: "Consignación / Venta de unidad",
  import: "Importación a pedido",
  general: "Consulta general"
};

function normalizeWhatsappNumber(phone: string) {
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("09") && digits.length === 10) {
    return `595${digits.slice(1)}`;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `595${digits}`;
  }
  return digits;
}

export async function sendInquiryNotification(
  inquiry: Inquiry,
  config: Settings,
  vehicleLabel?: string
): Promise<{ sentTelegram: boolean; sentWebhook: boolean; errors: string[] }> {
  const errors: string[] = [];
  let sentTelegram = false;
  let sentWebhook = false;

  const waDigits = normalizeWhatsappNumber(inquiry.phone);
  const replyText = `Hola ${inquiry.name}, te contactamos de Dream Cars PY por tu consulta${
    vehicleLabel ? ` sobre el ${vehicleLabel}` : ""
  }. ¿Cómo estás?`;
  const whatsappUrl = waDigits
    ? `https://wa.me/${waDigits}?text=${encodeURIComponent(replyText)}`
    : "";

  const typeLabel = TYPE_LABELS[inquiry.type] || inquiry.type || "Consulta web";
  const lines = [
    `🏁 NUEVA CONSULTA · DREAM CARS PY`,
    `• Operación: ${typeLabel}`,
    `• Cliente: ${inquiry.name}`,
    `• WhatsApp / Tel: ${inquiry.phone}`,
    ...(vehicleLabel ? [`• Unidad: ${vehicleLabel}`] : []),
    `• Mensaje: ${inquiry.message}`,
    ...(whatsappUrl ? [`\n💬 Responder directo: ${whatsappUrl}`] : [])
  ];
  const text = lines.join("\n");

  const botToken = config.telegramBotToken?.trim();
  const chatId = config.telegramChatId?.trim();
  if (botToken && chatId) {
    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(whatsappUrl
            ? {
                reply_markup: {
                  inline_keyboard: [[{ text: "💬 Responder por WhatsApp", url: whatsappUrl }]]
                }
              }
            : {})
        })
      });
      if (!tgRes.ok) {
        errors.push(`Telegram HTTP ${tgRes.status}`);
      } else {
        sentTelegram = true;
      }
    } catch (err) {
      errors.push(`Telegram: ${(err as Error).message}`);
    }
  }

  const webhookUrl = config.webhookUrl?.trim();
  if (webhookUrl) {
    try {
      const whRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "inquiry.created",
          source: "Dream Cars PY",
          text,
          content: text,
          whatsappUrl,
          vehicleLabel: vehicleLabel || null,
          inquiry
        })
      });
      if (!whRes.ok) {
        errors.push(`Webhook HTTP ${whRes.status}`);
      } else {
        sentWebhook = true;
      }
    } catch (err) {
      errors.push(`Webhook: ${(err as Error).message}`);
    }
  }

  return { sentTelegram, sentWebhook, errors };
}
