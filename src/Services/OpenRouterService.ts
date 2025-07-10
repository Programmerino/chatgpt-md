import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { AI_SERVICE_OPENROUTER, ROLE_SYSTEM } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { BaseAiService, IAiApiService, StreamingResponse } from "src/Services/AiService";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";

// Define a constant for OpenRouter service
export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: number;
    completion: number;
  };
}

export interface OpenRouterStreamPayload {
  model: string;
  messages: Array<Message>;
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  stream: boolean;
}

export interface OpenRouterConfig {
  aiService: string;
  frequency_penalty?: number;
  max_tokens?: number;
  model: string;
  openrouterApiKey: string;
  presence_penalty?: number;
  stream?: boolean;
  system_commands?: string[] | null;
  tags?: string[] | null;
  temperature?: number;
  title?: string;
  top_p?: number;
  url: string;
}

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  aiService: AI_SERVICE_OPENROUTER,
  model: "anthropic/claude-3-opus:beta",
  openrouterApiKey: "",
  stream: true,
  system_commands: null,
  tags: [],
  title: "Untitled",
  url: "https://openrouter.ai",
};

export const fetchAvailableOpenRouterModels = async (url: string, apiKey: string) => {
  try {
    const apiAuthService = new ApiAuthService();

    // Check if API key is empty or undefined
    if (!isValidApiKey(apiKey)) {
      console.error("OpenRouter API key is missing. Please add your OpenRouter API key in the settings.");
      return [];
    }

    // Use ApiService for the API request
    const apiService = new ApiService();
    const headers = apiAuthService.createAuthHeaders(apiKey, AI_SERVICE_OPENROUTER);

    const models = await apiService.makeGetRequest(`${url}/api/v1/models`, headers, AI_SERVICE_OPENROUTER);

    return models.data
      .sort((a: OpenRouterModel, b: OpenRouterModel) => {
        if (a.id < b.id) return 1;
        if (a.id > b.id) return -1;
        return 0;
      })
      .map((model: OpenRouterModel) => `${AI_SERVICE_OPENROUTER}@${model.id}`);
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
};

export class OpenRouterService extends BaseAiService implements IAiApiService {
  protected errorService: ErrorService;
  protected notificationService: NotificationService;
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected serviceType = AI_SERVICE_OPENROUTER;

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

  getDefaultConfig(): OpenRouterConfig {
    return DEFAULT_OPENROUTER_CONFIG;
  }

  getApiKeyFromSettings(settings: ChatGPT_MDSettings): string {
    return this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);
  }

  // Implement abstract methods from BaseAiService
  protected getSystemMessageRole(): string {
    return ROLE_SYSTEM; // OpenRouter uses standard system role
  }

  protected supportsSystemField(): boolean {
    return false; // OpenRouter uses messages array, not system field
  }

  createPayload(config: OpenRouterConfig, messages: Message[]): OpenRouterStreamPayload {
    // Remove the provider prefix if it exists in the model name
    const modelName = config.model.includes("@") ? config.model.split("@")[1] : config.model;

    // Process system commands using the centralized method
    const processedMessages = this.processSystemCommands(messages, config.system_commands);

    const payload: OpenRouterStreamPayload = {
      model: modelName,
      messages: processedMessages,
      stream: !!config.stream,
    };

    // Add optional parameters if they exist
    if (config.max_tokens !== undefined) payload.max_tokens = config.max_tokens;
    if (config.temperature !== undefined) payload.temperature = config.temperature;
    if (config.top_p !== undefined) payload.top_p = config.top_p;
    if (config.presence_penalty !== undefined) payload.presence_penalty = config.presence_penalty;
    if (config.frequency_penalty !== undefined) payload.frequency_penalty = config.frequency_penalty;

    return payload;
  }

  protected async callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    editor: Editor,
    headingPrefix: string,
    setAtCursor?: boolean | undefined,
    settings?: ChatGPT_MDSettings
  ): Promise<StreamingResponse> {
    // Use the default implementation from BaseAiService
    return this.defaultCallStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings);
  }

  protected async callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: OpenRouterConfig,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    // Use the default implementation from BaseAiService
    return this.defaultCallNonStreamingAPI(apiKey, messages, config, settings);
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService.showWarning("Could not infer title. The file name was not changed.");
  }
}
