import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENAI, ROLE_SYSTEM } from "src/Constants";
import { BaseAiService, IAiApiService, OpenAiModel } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export const DEFAULT_OPENAI_CONFIG: OpenAIConfig = {
  aiService: AI_SERVICE_OPENAI,
  model: "openai@gpt-4",
  stream: true,
  system_commands: null,
  tags: [],
  title: "Untitled",
  url: "https://api.openai.com",
};

export const fetchAvailableOpenAiModels = async (url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    if (!isValidApiKey(apiKey)) {
      console.error("OpenAI API key is missing. Please add your OpenAI API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENAI);

    const models = await apiService.makeGetRequest(`${url}/v1/models`, headers, AI_SERVICE_OPENAI);

    return models.data
      .filter(
        (model: OpenAiModel) =>
          (model.id.includes("o3") ||
            model.id.includes("o4") ||
            model.id.includes("o1") ||
            model.id.includes("gpt-4") ||
            model.id.includes("gpt-3")) &&
          !model.id.includes("audio") &&
          !model.id.includes("transcribe") &&
          !model.id.includes("realtime") &&
          !model.id.includes("o1-pro") &&
          !model.id.includes("tts")
      )
      .sort((a: OpenAiModel, b: OpenAiModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenAiModel) => `openai@${model.id}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OpenAiService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OPENAI;

  constructor(
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiService?: ApiService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    super(errorService, notificationService);
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiService = apiService || new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService(this.notificationService);
    this.apiResponseParser = apiResponseParser || new ApiResponseParser(this.notificationService);
  }

  getDefaultConfig(): OpenAIConfig {
    return DEFAULT_OPENAI_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM;
  }

  protected supportsSystemField(): boolean {
    return false; // OpenAI uses messages array, not system field
  }

  createPayload(config: OpenAIConfig, messages: Message[]): OpenAIStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands using the centralized method
    const processedMessages = this.processSystemCommands(messages, config.system_commands);

    // Create base payload
    const payload: OpenAIStreamPayload = {
      model: modelName,
      messages: processedMessages,
      stream: !!config.stream,
    };

    // Only include these parameters if the model supports them
    // o1, o4, and search models don't support custom temperature and other parameters
    const isRestrictedModel = modelName.includes("search") || modelName.includes("o1") || modelName.includes("o4");

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
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings
  ): Promise<{ fullString: string; mode: "streaming"; wasAborted?: boolean }> {
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenAIConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    // Use the default implementation from BaseAiService
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
