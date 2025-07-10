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
  model: "gpt-4.1-mini",
  stream: true,
  system_commands: null,
  tags: [],
  title: "Untitled",
  url: "https://api.openai.com",
};

export const fetchAvailableOpenAiModels = async (app: App, url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    if (!isValidApiKey(apiKey)) {
      console.warn("OpenAI API key is missing. Cannot fetch models.");
      return [];
    }

    const apiService = new ApiService(app);
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);

    const models = await apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_OPENAI);

    return models.data
      .filter(
        (model: OpenAiModel) =>
          !model.id.includes("vision") &&
          !model.id.includes("dalle") &&
          !model.id.includes("audio") &&
          !model.id.includes("transcribe") &&
          !model.id.includes("realtime") &&
          !model.id.includes("tts")
      )
      .sort((a: OpenAiModel, b: OpenAiModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenAiModel) => `${AI_SERVICE_OPENAI}@${model.id}`);
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

  createPayload(config: OpenAIConfig, messages: Message[]): OpenAIStreamPayload {
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    const processedMessages = this.processSystemCommands(messages, config.system_commands);

    const payload: OpenAIStreamPayload = {
      model: modelName,
      messages: processedMessages,
      stream: !!config.stream,
    };

    const isRestrictedModel = modelName.includes("search");

    if (config.max_tokens !== undefined) payload.max_tokens = config.max_tokens;

    if (!isRestrictedModel) {
      if (config.temperature !== undefined) payload.temperature = config.temperature;
      if (config.top_p !== undefined) payload.top_p = config.top_p;
      if (config.presence_penalty !== undefined) payload.presence_penalty = config.presence_penalty;
      if (config.frequency_penalty !== undefined) payload.frequency_penalty = config.frequency_penalty;
    }

    return payload;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
    editor: Editor | undefined,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    return this.defaultCallStreamingAPI(
      apiKey,
      messages,
      config,
      editor,
      headingPrefix,
      setAtCursor,
      settings,
      callbacks
    );
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    return this.defaultCallNonStreamingAPI(apiKey, messages, config, settings);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
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
  system_commands?: string[] | null;
  tags?: string[] | null;
  temperature?: number;
  title?: string;
  top_p?: number;
  url: string;
}
