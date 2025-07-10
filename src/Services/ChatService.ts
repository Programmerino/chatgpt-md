import { Editor, MarkdownView, Notice, Platform, TFile } from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { SettingsService } from "./SettingsService";
import { getHeadingPrefix } from "../Utilities/TextHelpers";
import { ROLE_ASSISTANT, ROLE_USER } from "src/Constants";
import { ApiAuthService } from "./ApiAuthService";
import { MessageService } from "./MessageService";
import { IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";

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

  private async _callAndProcessAI(
    file: TFile,
    messagesWithRole: any[],
    frontmatter: any,
    settings: ChatGPT_MDSettings,
    editor?: Editor, // For direct streaming
    callbacks?: StreamCallbacks // For sidebar UI
  ) {
    const aiService = this.serviceLocator.getAiApiService(frontmatter.aiService);
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService);
    const statusBarItemEl = this.serviceLocator.getStatusBarItem();

    if (Platform.isMobile) {
      new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
    } else {
      statusBarItemEl.setText(`Calling ${frontmatter.model}... (use 'Stop AI Generation' to cancel)`);
    }

    try {
      return await aiService.callAIAPI(
        messagesWithRole,
        frontmatter,
        headingPrefix,
        editor,
        editor ? settings.generateAtCursor : false,
        apiKeyToUse,
        settings,
        callbacks
      );
    } finally {
      statusBarItemEl.setText("");
    }
  }

  public async processChat(editor: Editor, view: MarkdownView): Promise<void> {
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }
    this.streaming = true;

    try {
      if (!view.file) return;

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();
      const frontmatter = await editorService.getFrontmatter(view.file, settings);
      const { messagesWithRole, messages } = await editorService.getMessagesFromEditor(editor, settings);

      if (!settings.generateAtCursor) {
        editorService.moveCursorToEnd(editor);
      }

      const response = await this._callAndProcessAI(view.file, messagesWithRole, frontmatter, settings, editor);

      // This is for editor-initiated chats. The full response is already streamed in.
      // We just need to add the next user prompt.
      editorService.processResponse(editor, response, settings);

      if (response && !response.wasAborted) {
        const updatedContent = editor.getValue();
        const { messages: updatedMessages } = await editorService.getMessagesFromFileContent(updatedContent, settings);
        await this.serviceLocator.getCommandRegistry().handleAutoTitleInference(view, frontmatter, updatedMessages);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[ChatGPT MD] Chat processing error:", err);
        new Notice(`[ChatGPT MD] Error: ${err.message}`);
      }
    } finally {
      this.streaming = false;
    }
  }

  public async sendMessageFromSidebar(message: string, file: TFile, callbacks: StreamCallbacks) {
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }
    this.streaming = true;

    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    const vault = this.serviceLocator.getApp().vault;

    try {
      // 1. Append user message directly to the file
      const userHeader = this.messageService.getHeaderRole(getHeadingPrefix(settings.headingLevel), ROLE_USER);
      await vault.append(file, `${userHeader}${message}`);

      // 2. Prepare for AI call
      const frontmatter = await editorService.getFrontmatter(file, settings);
      const fileContent = await vault.read(file);
      const { messagesWithRole } = await editorService.getMessagesFromFileContent(fileContent, settings);

      // 3. Call AI, passing callbacks for UI updates
      const response = await this._callAndProcessAI(
        file,
        messagesWithRole,
        frontmatter,
        settings,
        undefined,
        callbacks
      );

      // 4. Append the full response to the file now that streaming is complete.
      if (response && !response.wasAborted) {
        const assistantHeader = this.messageService.getHeaderRole(
          getHeadingPrefix(settings.headingLevel),
          ROLE_ASSISTANT,
          frontmatter.model
        );
        const fullResponseText = `${assistantHeader}${response.fullString}`;
        await vault.append(file, fullResponseText);

        const activeView = this.serviceLocator.getApp().workspace.getActiveViewOfType(MarkdownView);
        if (activeView && activeView.file?.path === file.path) {
          const updatedContent = await vault.read(file);
          const { messages: updatedMessages } = await editorService.getMessagesFromFileContent(
            updatedContent,
            settings
          );
          await this.serviceLocator
            .getCommandRegistry()
            .handleAutoTitleInference(activeView, frontmatter, updatedMessages);
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("[ChatGPT MD] Chat processing error:", err);
        new Notice(`[ChatGPT MD] Error: ${err.message}`);
      }
    } finally {
      this.streaming = false;
    }
  }
}
