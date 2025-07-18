import { Editor, EditorPosition } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { API_ENDPOINTS, DEBUG_MODEL_ID } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";
import { MockResponseModal } from "src/Views/MockResponseModal";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export interface IAiApiService {
  callAIAPI(
    messages: Message[],
    options: Record<string, unknown>,
    headingPrefix: string,
    editor?: Editor,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<{
    fullString: string;
    mode: string;
  }>;

  cancelRequest(): void;

  getRequestPayloadForDebug(
    apiKey: string | undefined,
    messages: Message[],
    options: Record<string, unknown>,
    settings: ChatGPT_MDSettings
  ): { payload: Record<string, any>; service: string };
}

export type StreamingResponse = {
  fullString: string;
  mode: "streaming";
};

export abstract class BaseAiService implements IAiApiService {
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected readonly errorService: ErrorService;
  protected readonly notificationService: NotificationService;

  constructor(apiService: ApiService, errorService?: ErrorService, notificationService?: NotificationService) {
    this.apiService = apiService;
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
  }

  // --- ABSTRACT MEMBERS ---
  protected abstract serviceType: string;
  abstract getDefaultConfig(): Record<string, any>;
  abstract createPayload(config: Record<string, unknown>, messages: Message[]): Record<string, any>;
  abstract getApiKeyFromSettings(settings: ChatGPT_MDSettings): string;
  protected abstract getSystemMessageRole(): string;
  protected abstract callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    editor: Editor | undefined,
    headingPrefix: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<StreamingResponse>;
  protected abstract callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    settings?: ChatGPT_MDSettings
  ): Promise<any>;

  // --- CONCRETE METHODS ---
  async callAIAPI(
    messages: Message[],
    options: Record<string, unknown> = {},
    headingPrefix: string,
    editor?: Editor,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<any> {
    const config = options;

    if (config.model === DEBUG_MODEL_ID) {
      return new Promise((resolve) => {
        new MockResponseModal(
          this.apiService.app,
          "Mock LLM Response",
          "Enter the response you want the AI to return.",
          (response) => {
            resolve({
              fullString: response,
              model: "DEBUG",
            });
          }
        ).open();
      });
    }

    return (config.stream as boolean)
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, settings, callbacks)
      : this.callNonStreamingAPI(apiKey, messages, config, settings);
  }

  public getRequestPayloadForDebug(
    apiKey: string | undefined,
    messages: Message[],
    options: Record<string, unknown>,
    settings: ChatGPT_MDSettings
  ): { payload: Record<string, any>; service: string } {
    const { payload } = this.prepareApiCall(apiKey, messages, options, settings);
    return { payload, service: this.serviceType };
  }

  public cancelRequest(): void {
    this.apiService?.cancelRequest();
  }

  protected getApiEndpoint(config: Record<string, unknown>): string {
    const url = typeof config.url === "string" ? config.url : "";
    return `${url}${API_ENDPOINTS[this.serviceType as keyof typeof API_ENDPOINTS]}`;
  }

  protected prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    settings?: ChatGPT_MDSettings
  ) {
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    const payload = this.createPayload(config, messages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    return { payload, headers };
  }

  protected handleApiCallError(err: any, config: Record<string, unknown>): any {
    console.error(`[ChatGPT MD] ${this.serviceType} API error:`, err);
    const model = typeof config.model === "string" ? config.model : "";
    const url = typeof config.url === "string" ? config.url : "";
    return this.errorService.handleApiError(err, this.serviceType, {
      returnForChat: true,
      showNotification: true,
      context: { model, url },
    });
  }

  protected async defaultCallStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    editor: Editor | undefined,
    headingPrefix: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<StreamingResponse> {
    let headerStartCursor: EditorPosition | undefined;
    let contentStartCursor: EditorPosition | undefined;
    const streamEndTracker = { current: contentStartCursor };

    try {
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config, settings);

      if (editor && !callbacks) {
        const lastLine = editor.lastLine();
        editor.setCursor({
          line: lastLine,
          ch: editor.getLine(lastLine).length,
        });

        headerStartCursor = editor.getCursor();
        const assistantHeader = this.apiResponseParser.getAssistantHeader(headingPrefix, payload.model);
        editor.replaceSelection(assistantHeader);
        contentStartCursor = editor.getCursor();
        streamEndTracker.current = contentStartCursor;
      }

      const response = await this.apiService.makeStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      const resultText = await this.apiResponseParser.processStreamResponse(
        response,
        this.serviceType,
        editor,
        streamEndTracker,
        callbacks
      );

      return { fullString: resultText, mode: "streaming" };
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("[ChatGPT MD] Stream was aborted by user.");
        if (editor && headerStartCursor) {
          // Clean up the partial header AND content that was inserted.
          // The end position is now correctly tracked in streamEndTracker.
          const endCursor = streamEndTracker.current;
          if (endCursor) {
            editor.replaceRange("", headerStartCursor, endCursor);
          }
        }
        callbacks?.onDone("");
        throw err; // Re-throw to be handled by the caller
      }
      // Handle other types of errors during streaming
      const errorMessage = `Error during streaming: ${err.message || err}`;
      console.error(`[ChatGPT MD]`, errorMessage);
      callbacks?.onDone("");
      throw new Error(errorMessage);
    }
  }

  protected async defaultCallNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, unknown>,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config, settings);

      const response = await this.apiService.makeNonStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      return { fullString: response, model: payload.model };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      return this.handleApiCallError(err, config);
    }
  }
}

export interface OpenAiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}
