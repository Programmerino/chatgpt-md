import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { IAiApiService } from "src/Services/AiService";
import { AiModelSuggestModal } from "src/Views/AiModelSuggestModal";
import { DEFAULT_OPENAI_CONFIG, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import { DEFAULT_OLLAMA_CONFIG, fetchAvailableOllamaModels } from "src/Services/OllamaService";
import { DEFAULT_OPENROUTER_CONFIG, fetchAvailableOpenRouterModels } from "src/Services/OpenRouterService";
import { DEFAULT_LMSTUDIO_CONFIG, fetchAvailableLmStudioModels } from "src/Services/LmStudioService";
import { DEFAULT_ANTHROPIC_CONFIG, fetchAvailableAnthropicModels } from "src/Services/AnthropicService";
import {
  ADD_COMMENT_BLOCK_COMMAND_ID,
  ADD_HR_COMMAND_ID,
  AI_SERVICE_ANTHROPIC,
  AI_SERVICE_LMSTUDIO,
  AI_SERVICE_OLLAMA,
  AI_SERVICE_OPENAI,
  AI_SERVICE_OPENROUTER,
  CALL_CHATGPT_API_COMMAND_ID,
  CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
  CLEAR_CHAT_COMMAND_ID,
  COMMENT_BLOCK_END,
  COMMENT_BLOCK_START,
  DEBUG_REQUEST_COMMAND_ID,
  FETCH_MODELS_TIMEOUT_MS,
  INFER_TITLE_COMMAND_ID,
  MIN_AUTO_INFER_MESSAGES,
  MOVE_TO_CHAT_COMMAND_ID,
  NEWLINE,
  ROLE_USER,
  STOP_GENERATING_COMMAND_ID,
} from "src/Constants";
import { getHeadingPrefix, isTitleTimestampFormat } from "src/Utilities/TextHelpers";
import { ApiAuthService, isValidApiKey } from "../Services/ApiAuthService";

/**
 * Registers and manages commands for the plugin
 */
export class CommandRegistry {
  private plugin: Plugin;
  private serviceLocator: ServiceLocator;
  private settingsService: SettingsService;
  private aiService: IAiApiService | null = null;
  private statusBarItemEl: HTMLElement;
  private apiAuthService: ApiAuthService;
  public availableModels: string[] = [];

  constructor(plugin: Plugin, serviceLocator: ServiceLocator, settingsService: SettingsService) {
    this.plugin = plugin;
    this.serviceLocator = serviceLocator;
    this.settingsService = settingsService;
    this.statusBarItemEl = plugin.addStatusBarItem();
    this.apiAuthService = new ApiAuthService();
  }

  /**
   * Register all commands
   */
  registerCommands(): void {
    this.registerChatCommand();
    this.registerSelectModelCommand();
    this.registerDebugRequestCommand();
    this.registerAddDividerCommand();
    this.registerAddCommentBlockCommand();
    this.registerCancelGenerationCommand();
    this.registerInferTitleCommand();
    this.registerMoveToNewChatCommand();
    this.registerChooseChatTemplateCommand();
    this.registerClearChatCommand();
  }

  /**
   * Handles the logic for automatically inferring a note's title.
   */
  private async handleAutoTitleInference(view: MarkdownView, frontmatter: any, messages: string[]): Promise<void> {
    const settings = this.settingsService.getSettings();
    const editorService = this.serviceLocator.getEditorService();

    if (
      !view.file || // Ensure file exists
      !settings.autoInferTitle ||
      !isTitleTimestampFormat(view.file.basename, settings.dateFormat) ||
      messages.length < MIN_AUTO_INFER_MESSAGES
    ) {
      return; // Exit early if conditions aren't met
    }

    try {
      this.updateStatusBar(`Inferring title...`);

      // Use the same AI service that was used for the chat response
      const aiServiceForTitle = this.serviceLocator.getAiApiService(frontmatter.aiService);

      // The `frontmatter` object already contains the merged settings needed (model, url, etc.)
      // The `inferTitle` method in the service will handle getting the correct API key from global settings.
      const titleInferenceSettings = { ...settings, ...frontmatter };

      // Ensure model is set for title inference. If not, the service's default will be used.
      if (!titleInferenceSettings.model) {
        console.warn("[ChatGPT MD] Model not specified for auto title inference. The service's default will be used.");
      }

      console.log(
        `[ChatGPT MD] Auto-inferring title with service: ${frontmatter.aiService}, model: ${titleInferenceSettings.model || "default"}`
      );

      await aiServiceForTitle.inferTitle(view, titleInferenceSettings, messages, editorService);
    } catch (error) {
      console.error("[ChatGPT MD] Auto title inference failed:", error);
      // Do not show a notice for background failure, just log it.
    } finally {
      this.updateStatusBar(``); // Clear status bar
    }
  }

  /**
   * Register the main chat command
   */
  private registerChatCommand(): void {
    this.plugin.addCommand({
      id: CALL_CHATGPT_API_COMMAND_ID,
      name: "Chat",
      icon: "message-circle",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (!view.file) return;

        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();
        const frontmatter = await editorService.getFrontmatter(view, settings, this.plugin.app);
        const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        try {
          const { messagesWithRole, messages } = await editorService.getMessagesFromEditor(editor, settings);

          if (!settings.generateAtCursor) {
            editorService.moveCursorToEnd(editor);
          }

          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
          } else {
            this.updateStatusBar(`Calling ${frontmatter.model}... (use 'Stop AI Generation' to cancel)`);
          }

          const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

          const response = await aiService.callAIAPI(
            messagesWithRole,
            frontmatter,
            getHeadingPrefix(settings.headingLevel),
            editor,
            settings.generateAtCursor,
            apiKeyToUse,
            settings
          );

          this.updateStatusBar(""); // Clear status bar after API call
          editorService.processResponse(editor, response, settings);

          // Call the extracted title inference handler
          if (!response.wasAborted) {
            // Don't infer title if chat was aborted
            await this.handleAutoTitleInference(view, frontmatter, messages);
          }
        } catch (err) {
          if (err.name === "AbortError") {
            const message = "[ChatGPT MD] Request cancelled.";
            this.updateStatusBar("Request cancelled.");
            if (Platform.isMobile) new Notice(message);
            setTimeout(() => this.updateStatusBar(""), 3000);
            return;
          }

          this.updateStatusBar("Error occurred."); // Show error in status
          if (Platform.isMobile) {
            new Notice(`[ChatGPT MD] Error calling ${frontmatter.model}. ` + err, 9000);
          }
          console.error("[ChatGPT MD] Chat command error:", err);
          setTimeout(() => this.updateStatusBar(""), 5000); // Clear error after a bit
        }
      },
    });
  }

  /**
   * Register the select model command
   */
  private registerSelectModelCommand(): void {
    this.plugin.addCommand({
      id: "select-model-command",
      name: "Select Model",
      icon: "list",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        // --- Step 1: Open modal immediately with cached models ---
        const initialModal = new AiModelSuggestModal(
          this.plugin.app,
          editor,
          editorService,
          this.availableModels // Use potentially stale but instantly available models
        );
        initialModal.open();

        // --- Step 2: Fetch fresh models asynchronously ---
        (async () => {
          try {
            const frontmatter = await editorService.getFrontmatter(view, settings, this.plugin.app);
            const openAiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
            const openRouterKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);

            // Use the same URL structure as initializeAvailableModels
            const currentUrls = {
              [AI_SERVICE_OPENAI]: frontmatter.openaiUrl || settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
              [AI_SERVICE_OPENROUTER]:
                frontmatter.openrouterUrl || settings.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
              [AI_SERVICE_OLLAMA]: frontmatter.ollamaUrl || settings.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
              [AI_SERVICE_LMSTUDIO]: frontmatter.lmstudioUrl || settings.lmstudioUrl || DEFAULT_LMSTUDIO_CONFIG.url,
              [AI_SERVICE_ANTHROPIC]: frontmatter.anthropicUrl || settings.anthropicUrl || DEFAULT_ANTHROPIC_CONFIG.url,
            };

            const freshModels = await this.fetchAvailableModels(currentUrls, openAiKey, openRouterKey);

            // --- Step 3: Compare and potentially update modal ---
            // Basic comparison: Check if lengths differ or if sets of models differ
            const currentModelsSet = new Set(this.availableModels);
            const freshModelsSet = new Set(freshModels);
            const areDifferent =
              this.availableModels.length !== freshModels.length ||
              ![...currentModelsSet].every((model) => freshModelsSet.has(model)) ||
              ![...freshModelsSet].every((model) => currentModelsSet.has(model));

            if (areDifferent && freshModels.length > 0) {
              console.log("[ChatGPT MD] Models updated. Refreshing modal.");
              this.availableModels = freshModels; // Update the stored models

              // Close the initial modal and open a new one with fresh data
              initialModal.close();
              new AiModelSuggestModal(this.plugin.app, editor, editorService, this.availableModels).open();
            }
          } catch (e) {
            // Don't close the initial modal here, as it might still be useful
            // Just log the error for background fetching failure
            console.error("[ChatGPT MD] Error fetching fresh models in background:", e);
            // Optionally notify the user, but avoid being too intrusive
            // new Notice("Could not refresh model list in background.");
          }
        })(); // Self-invoking async function to run in background
      },
    });
  }

  /**
   * Register the debug request command.
   */
  private registerDebugRequestCommand(): void {
    this.plugin.addCommand({
      id: DEBUG_REQUEST_COMMAND_ID,
      name: "Debug: Create Request Note",
      icon: "bug",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        if (!view.file) {
          new Notice("Cannot run debug command without an active file.");
          return;
        }

        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        try {
          // 1. Get frontmatter and determine AI service
          const frontmatter = await editorService.getFrontmatter(view, settings, this.plugin.app);
          const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

          // 2. Get messages from editor (with links resolved, etc.)
          const { messagesWithRole } = await editorService.getMessagesFromEditor(editor, settings);

          // 3. Get the API key to pass validation (it's not sent anywhere)
          const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

          // 4. Prepare the payload using the new public method
          const { payload, service } = aiService.getRequestPayloadForDebug(
            apiKeyToUse,
            messagesWithRole,
            frontmatter,
            settings
          );

          // 5. Stringify the payload
          const payloadString = JSON.stringify(payload, null, 2);

          // 6. Create the content for the new note
          const debugNoteContent = `Debug output for: **${view.file.name}**
Service: **${service}**
Model: **${payload.model}**
Timestamp: **${new Date().toISOString()}**

---

### Request Payload

\`\`\`json
${payloadString}
\`\`\`
`;
          // 7. Create and open the debug file
          const fileService = this.serviceLocator.getFileService();
          await fileService.createAndOpenDebugFile(debugNoteContent, view.file.name);

          new Notice("Debug note created successfully.");
        } catch (err) {
          new Notice(`[ChatGPT MD] Error creating debug note: ${err.message}`);
          console.error("[ChatGPT MD] Error creating debug note:", err);
        }
      },
    });
  }

  /**
   * Register the add divider command
   */
  private registerAddDividerCommand(): void {
    this.plugin.addCommand({
      id: ADD_HR_COMMAND_ID,
      name: "Add divider",
      icon: "minus",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();
        editorService.addHorizontalRule(editor, ROLE_USER, settings.headingLevel);
      },
    });
  }

  /**
   * Register the add comment block command
   */
  private registerAddCommentBlockCommand(): void {
    this.plugin.addCommand({
      id: ADD_COMMENT_BLOCK_COMMAND_ID,
      name: "Add comment block",
      icon: "comment",
      editorCallback: (editor: Editor, _view: MarkdownView) => {
        // add a comment block at cursor
        const cursor = editor.getCursor();
        const line = cursor.line;
        const ch = cursor.ch;

        const commentBlock = `${COMMENT_BLOCK_START}${NEWLINE}${COMMENT_BLOCK_END}`;
        editor.replaceRange(commentBlock, cursor);

        // move cursor to middle of comment block
        const newCursor = {
          line: line + 1,
          ch: ch,
        };
        editor.setCursor(newCursor);
      },
    });
  }

  /**
   * Register the stop/cancel command
   */
  private registerCancelGenerationCommand(): void {
    this.plugin.addCommand({
      id: STOP_GENERATING_COMMAND_ID,
      name: "Stop AI Generation",
      icon: "octagon",
      callback: () => {
        // The ApiService holds the abort controller for the currently active request.
        this.serviceLocator.getApiService().cancelRequest();
        new Notice("Stop command issued.");
      },
    });
  }

  /**
   * Register the infer title command
   */
  private registerInferTitleCommand(): void {
    this.plugin.addCommand({
      id: INFER_TITLE_COMMAND_ID,
      name: "Infer title",
      icon: "subtitles",
      editorCallback: async (editor: Editor, view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        // get frontmatter
        const frontmatter = await editorService.getFrontmatter(view, settings, this.plugin.app);
        this.aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

        // Ensure model is set
        if (!frontmatter.model) {
          console.log("[ChatGPT MD] Model not set in frontmatter, using default model");
          return;
        }

        this.updateStatusBar(`Calling ${frontmatter.model}`);
        const { messages } = await editorService.getMessagesFromEditor(editor, settings);

        // Use the utility function to get the correct API key
        const settingsWithApiKey = {
          ...settings,
          ...frontmatter,
          openrouterApiKey: this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER),
        };

        await this.aiService.inferTitle(view, settingsWithApiKey, messages, editorService);

        this.updateStatusBar("");
      },
    });
  }

  /**
   * Register the move to new chat command
   */
  private registerMoveToNewChatCommand(): void {
    this.plugin.addCommand({
      id: MOVE_TO_CHAT_COMMAND_ID,
      name: "Create new chat with highlighted text",
      icon: "highlighter",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        try {
          await editorService.createNewChatWithHighlightedText(editor, settings);
        } catch (err) {
          console.error(`[ChatGPT MD] Error in Create new chat with highlighted text`, err);
          new Notice(`[ChatGPT MD] Error in Create new chat with highlighted text, check console`);
        }
      },
    });
  }

  /**
   * Register the choose chat template command
   */
  private registerChooseChatTemplateCommand(): void {
    this.plugin.addCommand({
      id: CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
      name: "Create new chat from template",
      icon: "layout-template",
      callback: async () => {
        const editorService = this.serviceLocator.getEditorService();
        const settings = this.settingsService.getSettings();

        if (settings.dateFormat) {
          await editorService.createNewChatFromTemplate(
            settings,
            editorService.getDate(new Date(), settings.dateFormat)
          );
          return;
        }
        new Notice(
          "date format cannot be empty in your ChatGPT MD settings. You can choose something like YYYYMMDDhhmmss"
        );
      },
    });
  }

  /**
   * Register the clear chat command
   */
  private registerClearChatCommand(): void {
    this.plugin.addCommand({
      id: CLEAR_CHAT_COMMAND_ID,
      name: "Clear chat (except frontmatter)",
      icon: "trash",
      editorCallback: async (editor: Editor, _view: MarkdownView) => {
        const editorService = this.serviceLocator.getEditorService();
        await editorService.clearChat(editor);
      },
    });
  }

  private getAiApiUrls(frontmatter: any): { [key: string]: string } {
    return {
      openai: frontmatter.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
      openrouter: frontmatter.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
      ollama: frontmatter.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
      lmstudio: frontmatter.lmstudioUrl || DEFAULT_LMSTUDIO_CONFIG.url,
      anthropic: frontmatter.anthropicUrl || DEFAULT_ANTHROPIC_CONFIG.url,
    };
  }

  /**
   * Initialize available models on plugin startup.
   */
  public async initializeAvailableModels(): Promise<void> {
    console.log("[ChatGPT MD] Initializing available models...");
    try {
      const settings = this.settingsService.getSettings();
      const openAiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
      const openRouterKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENROUTER);
      // Use default URLs for initialization, assuming frontmatter isn't available yet
      const defaultUrls = {
        [AI_SERVICE_OPENAI]: settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
        [AI_SERVICE_OPENROUTER]: settings.openrouterUrl || DEFAULT_OPENROUTER_CONFIG.url,
        [AI_SERVICE_OLLAMA]: settings.ollamaUrl || DEFAULT_OLLAMA_CONFIG.url,
        [AI_SERVICE_LMSTUDIO]: settings.lmstudioUrl || DEFAULT_LMSTUDIO_CONFIG.url,
        [AI_SERVICE_ANTHROPIC]: settings.anthropicUrl || DEFAULT_ANTHROPIC_CONFIG.url,
      };

      this.availableModels = await this.fetchAvailableModels(defaultUrls, openAiKey, openRouterKey);
      console.log(`[ChatGPT MD] Found ${this.availableModels.length} available models.`);
    } catch (error) {
      console.error("[ChatGPT MD] Error initializing available models:", error);
      // Optionally show a notice, but avoid blocking startup
      // new Notice("Could not pre-fetch AI models. They will be fetched on demand.");
      this.availableModels = []; // Ensure it's an empty array on error
    }
  }

  /**
   * Fetch available models from all services
   */
  public async fetchAvailableModels(
    urls: { [key: string]: string },
    apiKey: string,
    openrouterApiKey: string
  ): Promise<string[]> {
    function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    }

    try {
      const promises: Promise<string[]>[] = [];

      // Add Ollama promise (always fetched)
      promises.push(withTimeout(fetchAvailableOllamaModels(urls[AI_SERVICE_OLLAMA]), FETCH_MODELS_TIMEOUT_MS, []));

      // Add LM Studio promise (always fetched, no API key required)
      promises.push(withTimeout(fetchAvailableLmStudioModels(urls[AI_SERVICE_LMSTUDIO]), FETCH_MODELS_TIMEOUT_MS, []));

      // Conditionally add OpenAI promise
      if (isValidApiKey(apiKey)) {
        promises.push(
          withTimeout(fetchAvailableOpenAiModels(urls[AI_SERVICE_OPENAI], apiKey), FETCH_MODELS_TIMEOUT_MS, [])
        );
      }

      // Conditionally add OpenRouter promise
      if (isValidApiKey(openrouterApiKey)) {
        promises.push(
          withTimeout(
            fetchAvailableOpenRouterModels(urls[AI_SERVICE_OPENROUTER], openrouterApiKey),
            FETCH_MODELS_TIMEOUT_MS,
            []
          )
        );
      }

      // Conditionally add Anthropic promise
      const anthropicApiKey = this.apiAuthService.getApiKey(this.settingsService.getSettings(), AI_SERVICE_ANTHROPIC);
      if (isValidApiKey(anthropicApiKey)) {
        promises.push(
          withTimeout(
            fetchAvailableAnthropicModels(urls[AI_SERVICE_ANTHROPIC], anthropicApiKey),
            FETCH_MODELS_TIMEOUT_MS,
            []
          )
        );
      }

      // Fetch all models in parallel and flatten the results
      const results = await Promise.all(promises);
      return results.flat();
    } catch (error) {
      // Handle potential errors during fetch or Promise.all
      new Notice("Error fetching models: " + (error instanceof Error ? error.message : String(error)));
      console.error("Error fetching models:", error);
      // Depending on desired behavior, you might return [] or rethrow
      return []; // Return empty array on error to avoid breaking the modal
    }
  }
  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
