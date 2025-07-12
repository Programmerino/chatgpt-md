import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { ServiceLocator } from "./ServiceLocator";
import { SettingsService } from "../Services/SettingsService";
import { DEFAULT_OPENAI_CONFIG, fetchAvailableOpenAiModels } from "src/Services/OpenAiService";
import {
  AI_SERVICE_OPENAI,
  CALL_CHATGPT_API_COMMAND_ID,
  CHOOSE_CHAT_TEMPLATE_COMMAND_ID,
  CLEAR_CHAT_COMMAND_ID,
  DEBUG_REQUEST_COMMAND_ID,
  FETCH_MODELS_TIMEOUT_MS,
  IMPORT_FROM_AI_STUDIO_COMMAND_ID,
  STOP_GENERATING_COMMAND_ID,
  TOGGLE_CHAT_SIDEBAR_COMMAND_ID,
} from "src/Constants";
import { ApiAuthService, isValidApiKey } from "../Services/ApiAuthService";
import { CHAT_SIDE_VIEW_TYPE } from "src/Views/ChatSideView";
import { ImportConversationModal } from "src/Views/ImportConversationModal";

/**
 * Registers and manages commands for the plugin
 */
export class CommandRegistry {
  private plugin: Plugin;
  private serviceLocator: ServiceLocator;
  private settingsService: SettingsService;
  private apiAuthService: ApiAuthService;
  public availableModels: string[] = [];
  public isProcessingChat = false;

  constructor(plugin: Plugin, serviceLocator: ServiceLocator, settingsService: SettingsService) {
    this.plugin = plugin;
    this.serviceLocator = serviceLocator;
    this.settingsService = settingsService;
    this.apiAuthService = serviceLocator.getApiAuthService();

    serviceLocator.setCommandRegistry(this);
  }

  /**
   * Register all commands
   */
  registerCommands(): void {
    this.registerChatCommand();
    this.registerToggleSidebarCommand();
    this.registerDebugRequestCommand();
    this.registerCancelGenerationCommand();
    this.registerChooseChatTemplateCommand();
    this.registerClearChatCommand();
    this.registerImportFromAiStudioCommand();
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
            workspace.revealLeaf(leaf);
          }
        }
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
          const frontmatter = await editorService.getFrontmatter(view.file, settings);
          const aiService = this.serviceLocator.getAiApiService();

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
   * Register the import from AI Studio command
   */
  private registerImportFromAiStudioCommand(): void {
    this.plugin.addCommand({
      id: IMPORT_FROM_AI_STUDIO_COMMAND_ID,
      name: "Import from AI Studio",
      icon: "file-import",
      callback: () => {
        new ImportConversationModal(
          this.plugin.app,
          this.serviceLocator.getSettingsService(),
          this.serviceLocator.getFileService(),
          this.serviceLocator.getMessageService()
        ).open();
      },
    });
  }

  /**
   * Initialize available models on plugin startup.
   */
  public async initializeAvailableModels(): Promise<void> {
    console.log("[ChatGPT MD] Initializing available models...");
    try {
      this.availableModels = await this.fetchAvailableModels();
      console.log(`[ChatGPT MD] Found ${this.availableModels.length} available models.`);
    } catch (error) {
      console.error("[ChatGPT MD] Error initializing available models:", error);
      this.availableModels = [];
    }
  }

  /**
   * Fetch available models from OpenAI
   */
  public async fetchAvailableModels(): Promise<string[]> {
    const settings = this.settingsService.getSettings();
    const apiKey = this.apiAuthService.getApiKey(settings, AI_SERVICE_OPENAI);
    const url = settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url;

    function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
      return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
    }

    try {
      if (isValidApiKey(apiKey)) {
        return await withTimeout(fetchAvailableOpenAiModels(this.plugin.app, url, apiKey), FETCH_MODELS_TIMEOUT_MS, []);
      }
      return [];
    } catch (error) {
      new Notice("Error fetching models: " + (error as Error).message);
      console.error("Error fetching models:", error);
      return [];
    }
  }
}
