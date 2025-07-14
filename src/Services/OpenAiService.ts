import { App, Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel, StreamCallbacks } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  model: "gpt-4o-mini",
  stream: true,
  tags: [],
  title: "Untitled",
  url: "https://api.openai.com",
};

export const fetchAvailableOpenAiModels = async (app: App, url: string, apiKey: string): Promise<string[]> => {
  try {
    const apiAuthService = new ApiAuthService();

    if (!isValidApiKey(apiKey)) {
      console.warn("OpenAI API key is missing. Cannot fetch models.");
      return [];
    }

    const apiService = new ApiService(app);
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);

    const models = await apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_OPENAI);

    // Return all model IDs, sorted alphabetically
    return models.data.map((model: OpenAiModel) => model.id).sort((a: string, b: string) => a.localeCompare(b));
  } catch (error) {
    console.error("Error fetching OpenAI models:", error);
    return [];
  }
};

export class OpenAiService extends BaseAiService implements IAiApiService {
  protected serviceType = AI_SERVICE_OPENAI;

  constructor(apiService: ApiService, errorService?: ErrorService, notificationService?: NotificationService) {
    super(apiService, errorService, notificationService);
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
  }

  getDefaultConfig(): OpenAIConfig {
    return DEFAULT_OPENAI_CONFIG;
  }

  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM;
  }

  createPayload(config: Record<string, unknown>, messages: Message[]): OpenAIStreamPayload {
    const modelName = config.model as string;

    const payload: OpenAIStreamPayload = {
      model: modelName,
      messages: messages,
      stream: !!config.stream,
    };

    if (config.max_tokens !== undefined) payload.max_tokens = config.max_tokens as number;
    if (config.temperature !== undefined) payload.temperature = config.temperature as number;
    if (config.top_p !== undefined) payload.top_p = config.top_p as number;
    if (config.presence_penalty !== undefined) payload.presence_penalty = config.presence_penalty as number;
    if (config.frequency_penalty !== undefined) payload.frequency_penalty = config.frequency_penalty as number;

    return payload;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    editor: Editor | undefined,
    headingPrefix: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, settings, callbacks);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    return this.defaultCallNonStreamingAPI(apiKey, messages, config, settings);
  }
}

export interface OpenAIStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  stream: boolean;
}

export interface OpenAIConfig {
  aiService: string;
  frequency_penalty?: number;
  max_tokens?: number;
  model: string;
  presence_penalty?: number;
  stream?: boolean;
  tags?: string[] | null;
  temperature?: number;
  title?: string;
  top_p?: number;
  url: string;
}
