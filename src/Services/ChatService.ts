import { Editor, MarkdownView, Notice, Platform, TFile } from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { SettingsService } from "./SettingsService";
import { getHeadingPrefix, getHeaderRole } from "../Utilities/TextHelpers";
import { ROLE_ASSISTANT, ROLE_USER } from "src/Constants";
import { ApiAuthService } from "./ApiAuthService";
import { MessageService } from "./MessageService";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export class ChatService {
  private streaming = false;
  private apiAuthService: ApiAuthService;
  private messageService: MessageService;

  constructor(
    private serviceLocator: ServiceLocator,
    private settingsService: SettingsService
  ) {
    this.apiAuthService = serviceLocator.getApiAuthService();
    this.messageService = serviceLocator.getMessageService();
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

    try {
      if (!view.file) return;

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();
      const frontmatter = await editorService.getFrontmatter(view.file, settings);
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

      // This is for editor-initiated chats. The full response is already streamed in.
      // We just need to add the next user prompt.
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

  public async sendMessageFromSidebar(message: string, file: TFile, callbacks: StreamCallbacks) {
    const workspace = this.serviceLocator.getApp().workspace;
    const leaf = workspace.getLeavesOfType("markdown").find((l) => {
      return l.view instanceof MarkdownView && l.view.file === file;
    });

    if (!leaf || !(leaf.view instanceof MarkdownView)) {
      new Notice("The chat note for this conversation is not open in any tab.");
      callbacks.onDone(""); // Stop loading indicator in sidebar
      return;
    }

    const view = leaf.view;
    const editor = view.editor;

    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();

    // 1. Append user message to the editor note.
    editorService.appendUserMessage(editor, message, settings);

    // 2. Process the chat.
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }

    this.streaming = true;
    const statusBarItemEl = this.serviceLocator.getStatusBarItem();

    try {
      const frontmatter = await editorService.getFrontmatter(view.file, settings);
      const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);
      const { messagesWithRole, messages } = await editorService.getMessagesFromEditor(editor, settings);

      if (Platform.isMobile) {
        new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
      } else {
        statusBarItemEl.setText(`Calling ${frontmatter.model}... (use 'Stop AI Generation' to cancel)`);
      }

      const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);

      // Call AI service with callbacks for UI, but NO editor for direct streaming.
      const response = await aiService.callAIAPI(
        messagesWithRole,
        frontmatter,
        getHeadingPrefix(settings.headingLevel),
        undefined, // No editor for direct streaming
        false,
        apiKeyToUse,
        settings,
        callbacks
      );

      // Append the full response to the editor now that streaming is complete.
      if (response && !response.wasAborted) {
        const assistantHeader = this.messageService.getHeaderRole(
          getHeadingPrefix(settings.headingLevel),
          ROLE_ASSISTANT,
          frontmatter.model
        );
        const userHeader = this.messageService.getHeaderRole(getHeadingPrefix(settings.headingLevel), ROLE_USER);
        const fullResponseText = assistantHeader + response.fullString + userHeader;

        editorService.moveCursorToEnd(editor);
        editor.replaceRange(fullResponseText, editor.getCursor());

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
}
