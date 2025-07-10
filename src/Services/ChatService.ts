import { Editor, MarkdownView, Notice, Platform } from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { SettingsService } from "./SettingsService";
import { getHeadingPrefix, getHeaderRole } from "../Utilities/TextHelpers";
import { ROLE_USER } from "src/Constants";
import { ApiAuthService } from "./ApiAuthService";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export class ChatService {
  private streaming = false;
  private apiAuthService: ApiAuthService;

  constructor(
    private serviceLocator: ServiceLocator,
    private settingsService: SettingsService
  ) {
    this.apiAuthService = serviceLocator.getApiAuthService();
  }

  public isStreaming(): boolean {
    return this.streaming;
  }

  public async processChat(editor: Editor, view: MarkdownView, callbacks?: StreamCallbacks): Promise<void> {
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }

    this.streaming = true;
    const statusBarItemEl = this.serviceLocator.getStatusBarItem();

    // The entire logic is wrapped in a try...finally block to ensure streaming is set to false
    try {
      if (!view.file) return;

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();
      const frontmatter = await editorService.getFrontmatter(view, settings);
      const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);

      const { messagesWithRole, messages } = await editorService.getMessagesFromEditor(editor, settings);

      if (!settings.generateAtCursor && !callbacks) {
        editorService.moveCursorToEnd(editor);
      }

      if (Platform.isMobile) {
        new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
      } else {
        statusBarItemEl.setText(`Calling ${frontmatter.model}... (use 'Stop AI Generation' to cancel)`);
      }

      const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

      const response = await aiService.callAIAPI(
        messagesWithRole,
        frontmatter,
        getHeadingPrefix(settings.headingLevel),
        editor,
        settings.generateAtCursor,
        apiKeyToUse,
        settings,
        callbacks
      );

      // If there are no callbacks, it means the call was not from the sidebar,
      // so we process the response in the standard way for the editor.
      if (!callbacks) {
        editorService.processResponse(editor, response, settings);
      }

      if (response && !response.wasAborted) {
        await this.serviceLocator.getCommandRegistry().handleAutoTitleInference(view, frontmatter, messages);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[ChatGPT MD] Chat processing error:", err);
        new Notice(`[ChatGPT MD] Error: ${err.message}`);
      }
    } finally {
      this.streaming = false;
      statusBarItemEl.setText("");
    }
  }

  public async sendMessageFromSidebar(message: string, callbacks: StreamCallbacks) {
    const activeView = this.serviceLocator.getApp().workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      new Notice("No active chat note. Please open a chat note first.");
      return;
    }

    const editor = activeView.editor;
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();

    // 1. Append user message to the editor note to keep it as the source of truth.
    editorService.moveCursorToEnd(editor);
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const userHeader = getHeaderRole(headingPrefix, ROLE_USER);
    editor.replaceRange(userHeader + "\n" + message, editor.getCursor());

    // 2. Process the chat, which will now include the new message.
    await this.processChat(editor, activeView, callbacks);
  }
}
