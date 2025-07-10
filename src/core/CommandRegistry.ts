import { Editor, MarkdownView, Notice, Platform, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { IAiApiService } from "src/Services/AiService";
import { AiModelSuggestModal } from "src/Views/AiModelSuggestModal";
import { DEFAULT_OPENAI_CONFIG, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import {
  ADD_COMMENT_BLOCK_COMMAND_ID,
  ADD_HR_COMMAND_ID,
  AI_SERVICE_OPENAI,
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
  TOGGLE_CHAT_SIDEBAR_COMMAND_ID,
} from "src/Constants";
import { isTitleTimestampFormat } from "src/Utilities/TextHelpers";
import { ApiAuthService, isValidApiKey } from "../Services/ApiAuthService";
import { CHAT_SIDE_VIEW_TYPE } from "src/Views/ChatSideView";

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
  public isProcessingChat = false;

  constructor(plugin: Plugin, serviceLocator: ServiceLocator, settingsService: SettingsService) {
    this.plugin = plugin;
    this.serviceLocator = serviceLocator;
    this.settingsService = settingsService;
    this.statusBarItemEl = serviceLocator.getStatusBarItem();
    this.apiAuthService = serviceLocator.getApiAuthService();

    serviceLocator.setCommandRegistry(this);
  }

  /**
   * Register all commands
   */
  registerCommands(): void {
    this.registerChatCommand();
    this.registerToggleSidebarCommand();
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
  public async handleAutoTitleInference(view: MarkdownView, frontmatter: any, messages: string[]): Promise<void> {
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

      const aiServiceForTitle = this.serviceLocator.getAiApiService(frontmatter.aiService);

      const titleInferenceSettings = { ...settings, ...frontmatter };

      if (!titleInferenceSettings.model) {
        console.warn("[ChatGPT MD] Model not specified for auto title inference. The service's default will be used.");
      }

      await aiServiceForTitle.inferTitle(view, titleInferenceSettings, messages, editorService);
    } catch (error) {
      console.error("[ChatGPT MD] Auto title inference failed:", error);
    } finally {
      this.updateStatusBar(``);
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
        const chatService = this.serviceLocator.getChatService();
        await chatService.processChat(editor, view);
      },
    });
  }

  /**
   * Register command to toggle the chat sidebar.
   */
  private registerToggleSidebarCommand(): void {
    this.plugin.addCommand({
      id: TOGGLE_CHAT_SIDEBAR_COMMAND_ID,
      name: "Toggle Chat Sidebar",
      icon: "sidebar-open",
      callback: () => {
        const workspace = this.plugin.app.workspace;
        const existingLeaves = workspace.getLeavesOfType(CHAT_SIDE_VIEW_TYPE);
        if (existingLeaves.length > 0) {
          workspace.detachLeavesOfType(CHAT_SIDE_VIEW_TYPE);
        } else {
          const leaf = workspace.getRightLeaf(false);
          if (leaf) {
            leaf.setViewState({
              type: CHAT_SIDE_VIEW_TYPE,
              active: true,
            });
          }
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

        const initialModal = new AiModelSuggestModal(this.plugin.app, view, editorService, this.availableModels);
        initialModal.open();

        (async () => {
          try {
            const frontmatter = await editorService.getFrontmatter(view, settings);
            const openAiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);

            const currentUrls = {
              [AI_SERVICE_OPENAI]: frontmatter.openaiUrl || settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
            };

            const freshModels = await this.fetchAvailableModels(currentUrls, openAiKey);

            const currentModelsSet = new Set(this.availableModels);
            const freshModelsSet = new Set(freshModels);
            const areDifferent =
              this.availableModels.length !== freshModels.length ||
              ![...currentModelsSet].every((model) => freshModelsSet.has(model)) ||
              ![...freshModelsSet].every((model) => currentModelsSet.has(model));

            if (areDifferent && freshModels.length > 0) {
              this.availableModels = freshModels;
              initialModal.close();
              new AiModelSuggestModal(this.plugin.app, view, editorService, this.availableModels).open();
            }
          } catch (e) {
            console.error("[ChatGPT MD] Error fetching fresh models in background:", e);
          }
        })();
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
          const frontmatter = await editorService.getFrontmatter(view, settings);
          const aiService = this.serviceLocator.getAiApiService(AI_SERVICE_OPENAI);

          const { messagesWithRole } = await editorService.getMessagesFromEditor(editor, settings);

          const apiKeyToUse = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);

          const { payload, service } = aiService.getRequestPayloadForDebug(
            apiKeyToUse,
            messagesWithRole,
            frontmatter,
            settings
          );

          const payloadString = JSON.stringify(payload, null, 2);

          const debugNoteContent = `Debug output for: **${view.file.name}**\nService: **${service}**\nModel: **${
            payload.model
          }**\nTimestamp: **${new Date().toISOString()}**\n\n---\n\n### Request Payload\n\n\`\`\`json\n${payloadString}\n\`\`\`\n`;
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
        this.serviceLocator.getEditorService().addCommentBlock(editor, COMMENT_BLOCK_START, COMMENT_BLOCK_END);
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

        const frontmatter = await editorService.getFrontmatter(view, settings);
        this.aiService = this.serviceLocator.getAiApiService(AI_SERVICE_OPENAI);

        if (!frontmatter.model) {
          console.log("[ChatGPT MD] Model not set in frontmatter, using default model");
          return;
        }

        this.updateStatusBar(`Calling ${frontmatter.model}`);
        const { messages } = await editorService.getMessagesFromEditor(editor, settings);

        const settingsWithApiKey = {
          ...settings,
          ...frontmatter,
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

  /**
   * Initialize available models on plugin startup.
   */
  public async initializeAvailableModels(): Promise<void> {
    console.log("[ChatGPT MD] Initializing available models...");
    try {
      const settings = this.settingsService.getSettings();
      const openAiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);

      const defaultUrls = {
        [AI_SERVICE_OPENAI]: settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url,
      };

      this.availableModels = await this.fetchAvailableModels(defaultUrls, openAiKey);
      console.log(`[ChatGPT MD] Found ${this.availableModels.length} available models.`);
    } catch (error) {
      console.error("[ChatGPT MD] Error initializing available models:", error);
      this.availableModels = [];
    }
  }

  /**
   * Fetch available models from all services
   */
  public async fetchAvailableModels(urls: { [key: string]: string }, apiKey: string): Promise<string[]> {
    function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    }

    try {
      const promises: Promise<string[]>[] = [];

      if (isValidApiKey(apiKey)) {
        promises.push(
          withTimeout(fetchAvailableOpenAiModels(urls[AI_SERVICE_OPENAI], apiKey), FETCH_MODELS_TIMEOUT_MS, [])
        );
      }

      const results = await Promise.all(promises);
      return results.flat();
    } catch (error) {
      new Notice("Error fetching models: " + (error as Error).message);
      console.error("Error fetching models:", error);
      return [];
    }
  }

  /**
   * Update the status bar with the given text
   */
  private updateStatusBar(text: string) {
    this.statusBarItemEl.setText(`[ChatGPT MD] ${text}`);
  }
}
