import { getZapiRuntimeConfig } from "@/lib/integration-config";
import { writeTechnicalLog } from "@/lib/logger";

type SendTextInput = {
  phone: string;
  message: string;
  delayTypingSeconds?: number;
  config?: Partial<ZapiConfig>;
};

type SendButtonListInput = {
  phone: string;
  message: string;
  buttons: Array<{ id: string; label: string }>;
  config?: Partial<ZapiConfig>;
};

type SendOptionListInput = {
  phone: string;
  message: string;
  title: string;
  buttonLabel: string;
  options: Array<{ id: string; title: string; description?: string }>;
  config?: Partial<ZapiConfig>;
};

type ZapiConfig = Awaited<ReturnType<typeof getZapiRuntimeConfig>>;

export class ZapiService {
  async markAsRead(messageId: string, phone: string, config?: Partial<ZapiConfig>) {
    return this.optionalPost("read-message", { messageId, phone }, config);
  }

  async sendText({ phone, message, delayTypingSeconds, config }: SendTextInput) {
    const zapiConfig = { ...(await getZapiRuntimeConfig()), ...cleanConfig(config) };
    if (!zapiConfig.instanceId || !zapiConfig.token) {
      throw new Error("Z-API nao configurada.");
    }

    const endpoint = `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/send-text`;
    const body = {
      phone,
      message,
      ...(delayTypingSeconds
        ? { delayTyping: Math.min(15, Math.max(1, Math.round(delayTypingSeconds))) }
        : {}),
    };

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(zapiConfig.clientToken ? { "Client-Token": zapiConfig.clientToken } : {}),
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });

        if (response.ok) {
          return response.json() as Promise<unknown>;
        }

        const responseBody = await response.text();
        await writeTechnicalLog({
          level: "ERROR",
          category: "integration",
          message: `Falha ao enviar mensagem pela Z-API (tentativa ${attempt}).`,
          method: "POST",
          endpoint: "send-text",
          statusCode: response.status,
          integration: "zapi",
          metadata: { response: responseBody.slice(0, 500) },
        });

        if (response.status < 500 || attempt === 2) {
          throw new Error("Falha ao enviar mensagem pela Z-API.");
        }
      } catch (error) {
        if (attempt === 2) throw error;
        await wait(500);
      }
    }

    throw new Error("Falha ao enviar mensagem pela Z-API.");
  }

  async sendButtonList({ phone, message, buttons, config }: SendButtonListInput) {
    return this.sendInteractive("send-button-actions", {
      phone,
      message,
      buttonActions: buttons.map((button) => ({
        id: button.id,
        type: "REPLY",
        label: button.label,
      })),
    }, config);
  }

  async sendOptionList({ phone, title, message, buttonLabel, options, config }: SendOptionListInput) {
    return this.sendInteractive("send-option-list", {
      phone,
      message,
      optionList: {
        title,
        buttonLabel,
        options: options.map((option) => ({
          id: option.id,
          title: option.title,
          description: option.description,
        })),
      },
    }, config);
  }

  private async optionalPost(action: string, body: Record<string, string>, config?: Partial<ZapiConfig>) {
    try {
      const zapiConfig = { ...(await getZapiRuntimeConfig()), ...cleanConfig(config) };
      if (!zapiConfig.instanceId || !zapiConfig.token) {
        return false;
      }

      const response = await fetch(
        `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(zapiConfig.clientToken ? { "Client-Token": zapiConfig.clientToken } : {}),
          },
          body: JSON.stringify(body),
        },
      );

      return response.ok;
    } catch {
      return false;
    }
  }

  private async sendInteractive(action: string, body: Record<string, unknown>, config?: Partial<ZapiConfig>) {
    const zapiConfig = { ...(await getZapiRuntimeConfig()), ...cleanConfig(config) };
    if (!zapiConfig.instanceId || !zapiConfig.token) {
      throw new Error("Z-API nao configurada.");
    }

    const response = await fetch(
      `${zapiConfig.baseUrl}/instances/${zapiConfig.instanceId}/token/${zapiConfig.token}/${action}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(zapiConfig.clientToken ? { "Client-Token": zapiConfig.clientToken } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (response.ok) {
      return response.json() as Promise<unknown>;
    }

    const responseBody = await response.text();
    await writeTechnicalLog({
      level: "ERROR",
      category: "integration",
      message: `Falha ao enviar mensagem interativa pela Z-API em ${action}.`,
      method: "POST",
      endpoint: action,
      statusCode: response.status,
      integration: "zapi",
      metadata: { response: responseBody.slice(0, 500) },
    });

    throw new Error(`Falha ao enviar mensagem interativa pela Z-API em ${action}.`);
  }
}

function cleanConfig(config?: Partial<ZapiConfig>) {
  return Object.fromEntries(Object.entries(config ?? {}).filter(([, value]) => Boolean(value))) as Partial<ZapiConfig>;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
