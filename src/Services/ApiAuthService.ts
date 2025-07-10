import { AI_SERVICE_OPENAI } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { NotificationService } from "./NotificationService";

export function isValidApiKey(apiKey?: string): boolean {
  return !!apiKey && apiKey.trim() !== "";
}

export class ApiAuthService {
  private notificationService: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  getApiKey(settings: ChatGPT_MDSettings, serviceType: string): string {
    if (serviceType === AI_SERVICE_OPENAI) {
      return settings.apiKey;
    }
    return "";
  }

  validateApiKey(apiKey: string | undefined, serviceName: string): void {
    if (!isValidApiKey(apiKey)) {
      const errorMessage = `${serviceName} API key is missing. Please add it in the settings.`;
      this.notificationService.showError(errorMessage);
      throw new Error(errorMessage);
    }
  }

  createAuthHeaders(apiKey: string, serviceType: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (serviceType === AI_SERVICE_OPENAI) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
  }
}
