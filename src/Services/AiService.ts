import { Editor, MarkdownView, Platform, EditorPosition } from "obsidian";
import { Message } from "src/Models/Message";
import { ApiService } from "./ApiService";
import { ApiAuthService, isValidApiKey } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { EditorService } from "./EditorService";
import { API_ENDPOINTS, NEWLINE, PLUGIN_SYSTEM_MESSAGE, ROLE_USER, AI_SERVICE_OPENAI } from "src/Constants";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export interface IAiApiService {
  callAIAPI(
    messages: Message[],
    options: Record<string, any>,
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<{
    fullString: string;
    mode: string;
    wasAborted?: boolean;
  }>;

  cancelRequest(): void;

  inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string>;

  getRequestPayloadForDebug(
    apiKey: string | undefined,
    messages: Message[],
    options: Record<string, any>,
    settings: ChatGPT_MDSettings
  ): { payload: Record<string, any>; service: string };
}

export type StreamingResponse = {
  fullString: string;
  mode: "streaming";
  wasAborted?: boolean;
};

export abstract class BaseAiService implements IAiApiService {
  protected apiService: ApiService;
  protected apiAuthService: ApiAuthService;
  protected apiResponseParser: ApiResponseParser;
  protected readonly errorService: ErrorService;
  protected readonly notificationService: NotificationService;

  constructor(errorService?: ErrorService, notificationService?: NotificationService) {
    this.notificationService = notificationService ?? new NotificationService();
    this.errorService = errorService ?? new ErrorService(this.notificationService);
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);
  }

  // --- ABSTRACT MEMBERS ---
  protected abstract serviceType: string;
  abstract getDefaultConfig(): Record<string, any>;
  abstract createPayload(config: Record<string, any>, messages: Message[]): Record<string, any>;
  abstract getApiKeyFromSettings(settings: ChatGPT_MDSettings): string;
  protected abstract getSystemMessageRole(): string;
  protected abstract callStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor | undefined,
    headingPrefix: string,
    setAtCursor?: boolean,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<StreamingResponse>;
  protected abstract callNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    settings?: ChatGPT_MDSettings
  ): Promise<any>;

  // --- CONCRETE METHODS ---
  async callAIAPI(
    messages: Message[],
    options: Record<string, any> = {},
    headingPrefix: string,
    editor?: Editor,
    setAtCursor?: boolean,
    apiKey?: string,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<any> {
    const config = options;

    return options.stream
      ? this.callStreamingAPI(apiKey, messages, config, editor, headingPrefix, setAtCursor, settings, callbacks)
      : this.callNonStreamingAPI(apiKey, messages, config, settings);
  }

  public getRequestPayloadForDebug(
    apiKey: string | undefined,
    messages: Message[],
    options: Record<string, any>,
    settings: ChatGPT_MDSettings
  ): { payload: Record<string, any>; service: string } {
    const { payload } = this.prepareApiCall(apiKey, messages, options, false, settings);
    return { payload, service: this.serviceType };
  }

  async inferTitle(
    view: MarkdownView,
    settings: ChatGPT_MDSettings,
    messages: string[],
    editorService: EditorService
  ): Promise<string> {
    try {
      if (!view.file) {
        throw new Error("No active file found");
      }
      const apiKey = this.getApiKeyFromSettings(settings);

      const titleResponse = await this.inferTitleFromMessages(apiKey, messages, settings);

      let titleStr = "";
      if (typeof titleResponse === "string") {
        titleStr = titleResponse;
      } else if (titleResponse && typeof titleResponse === "object") {
        const responseObj = titleResponse as { fullString?: string };
        titleStr = responseObj.fullString || "";
      }

      if (titleStr && titleStr.trim().length > 0) {
        await editorService.writeInferredTitle(view, titleStr.trim());
        return titleStr.trim();
      } else {
        this.showNoTitleInferredNotification();
        return "";
      }
    } catch (error) {
      if (error.name === "AbortError") {
        this.notificationService.showWarning("Title inference cancelled.");
        return "";
      }
      console.error("[ChatGPT MD] Error in inferTitle:", error);
      this.showNoTitleInferredNotification();
      return "";
    }
  }

  protected showNoTitleInferredNotification(): void {
    this.notificationService?.showWarning("Could not infer title. The file name was not changed.");
  }

  protected inferTitleFromMessages = async (apiKey: string, messages: string[], settings: any): Promise<string> => {
    try {
      const prompt = `Infer title from the summary of the content of these messages. The title **cannot** contain any of the following characters: colon (:), back slash (\\), forward slash (/), asterisk (*), question mark (?), double quote ("), less than (<), greater than (>), or pipe (|) as these are invalid in file names. Just return the title. Write the title in ${
        settings.inferTitleLanguage
      }. \nMessages:${NEWLINE}${JSON.stringify(messages)}`;

      const defaultConfig = this.getDefaultConfig();
      const config = { ...defaultConfig, ...settings };

      if (!config.model) config.model = defaultConfig.model;
      if (!config.url) config.url = defaultConfig.url;

      return await this.callNonStreamingAPIForTitleInference(
        apiKey,
        [{ role: ROLE_USER, content: prompt }],
        config,
        settings
      );
    } catch (err) {
      if (err.name === "AbortError") throw err;
      console.error(`[ChatGPT MD] Error inferring title:`, err);
      this.showNoTitleInferredNotification();
      return "";
    }
  };

  protected async callNonStreamingAPIForTitleInference(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    settings?: any
  ): Promise<any> {
    config.stream = false;
    const { payload, headers } = this.prepareApiCall(apiKey, messages, config, true, settings);
    const response = await this.apiService.makeNonStreamingRequest(
      this.getApiEndpoint(config),
      payload,
      headers,
      this.serviceType
    );
    return response;
  }

  public cancelRequest(): void {
    this.apiService?.cancelRequest();
  }

  protected processStreamingResult(result: { text: string; wasAborted: boolean }): StreamingResponse {
    if (result.wasAborted && result.text === "") {
      return { fullString: "", mode: "streaming", wasAborted: true };
    }
    return {
      fullString: result.text,
      mode: "streaming",
      wasAborted: result.wasAborted,
    };
  }

  protected getApiEndpoint(config: Record<string, any>): string {
    return `${config.url}${API_ENDPOINTS[this.serviceType as keyof typeof API_ENDPOINTS]}`;
  }

  protected addPluginSystemMessage(messages: Message[]): Message[] {
    const pluginSystemMessage: Message = {
      role: this.getSystemMessageRole(),
      content: PLUGIN_SYSTEM_MESSAGE,
    };
    return [pluginSystemMessage, ...messages];
  }

  protected processSystemCommands(messages: Message[], systemCommands: string[] | null | undefined): Message[] {
    if (!systemCommands || systemCommands.length === 0) return messages;
    const systemMessages = systemCommands.map((command) => ({
      role: this.getSystemMessageRole(),
      content: command,
    }));
    return [...systemMessages, ...messages];
  }

  protected prepareApiCall(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    skipPluginSystemMessage: boolean = false,
    settings?: ChatGPT_MDSettings
  ) {
    this.apiAuthService.validateApiKey(apiKey, this.serviceType);

    const shouldAddPluginSystemMessage = !skipPluginSystemMessage && !settings?.disablePluginSystemMessage;

    const finalMessages = shouldAddPluginSystemMessage ? this.addPluginSystemMessage(messages) : messages;

    const payload = this.createPayload(config, finalMessages);
    const headers = this.apiAuthService.createAuthHeaders(apiKey!, this.serviceType);

    return { payload, headers };
  }

  protected handleApiCallError(
    err: any,
    config: Record<string, any>,
    isTitleInference: boolean | string | undefined = false
  ): any {
    console.error(`[ChatGPT MD] ${this.serviceType} API error:`, err);
    if (isTitleInference) throw err;
    return this.errorService.handleApiError(err, this.serviceType, {
      returnForChat: true,
      showNotification: true,
      context: { model: config.model, url: config.url },
    });
  }

  protected async defaultCallStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    editor: Editor | undefined,
    headingPrefix: string,
    setAtCursor?: boolean,
    settings?: ChatGPT_MDSettings,
    callbacks?: StreamCallbacks
  ): Promise<StreamingResponse> {
    try {
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config, false, settings);

      let headerStartCursor: EditorPosition | undefined;
      let contentStartCursor: EditorPosition | undefined;

      if (editor && !callbacks) {
        if (!setAtCursor) {
          const lastLine = editor.lastLine();
          editor.setCursor({
            line: lastLine,
            ch: editor.getLine(lastLine).length,
          });
        }
        headerStartCursor = editor.getCursor();
        const assistantHeader = this.apiResponseParser.getAssistantHeader(headingPrefix, payload.model);
        editor.replaceSelection(assistantHeader);
        contentStartCursor = editor.getCursor();
      }

      const response = await this.apiService.makeStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      const result = await this.apiResponseParser.processStreamResponse(
        response,
        this.serviceType,
        editor,
        contentStartCursor,
        headerStartCursor,
        this.apiService,
        callbacks
      );

      return this.processStreamingResult(result);
    } catch (err) {
      const errorMessage = `Error: ${err}`;
      return { fullString: errorMessage, mode: "streaming" };
    }
  }

  protected async defaultCallNonStreamingAPI(
    apiKey: string | undefined,
    messages: Message[],
    config: Record<string, any>,
    settings?: ChatGPT_MDSettings
  ): Promise<any> {
    try {
      console.log(`[ChatGPT MD] "no stream"`, config);

      config.stream = false;
      const { payload, headers } = this.prepareApiCall(apiKey, messages, config, false, settings);

      const response = await this.apiService.makeNonStreamingRequest(
        this.getApiEndpoint(config),
        payload,
        headers,
        this.serviceType
      );

      return { fullString: response, model: payload.model };
    } catch (err) {
      if (err.name === "AbortError") throw err;
      const isTitleInference =
        messages.length === 1 && messages[0].content?.toString().includes("Infer title from the summary");
      return this.handleApiCallError(err, config, isTitleInference);
    }
  }
}

export interface OpenAiModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}
