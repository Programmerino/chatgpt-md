import { Editor, MarkdownView, Notice, Platform, TFile } from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { SettingsService } from "./SettingsService";
import { getHeadingPrefix, removeYAMLFrontMatter } from "../Utilities/TextHelpers";
import { HORIZONTAL_LINE_MD, ROLE_ASSISTANT, ROLE_USER } from "src/Constants";
import { ApiAuthService } from "./ApiAuthService";
import { MessageService } from "./MessageService";
import { IAiApiService } from "./AiService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "./EditorService";

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export class ChatService {
  private streaming = false;
  private apiAuthService: ApiAuthService;
  private messageService: MessageService;
  private notificationService = this.serviceLocator.getNotificationService();

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

  public cancelRequest(): void {
    this.serviceLocator.getApiService().cancelRequest();
  }

  private async _callAndProcessAI(
    file: TFile,
    messagesWithRole: any[],
    frontmatter: Record<string, unknown>,
    settings: ChatGPT_MDSettings,
    editor?: Editor, // For direct streaming
    callbacks?: StreamCallbacks // For sidebar UI
  ) {
    const aiService = this.serviceLocator.getAiApiService();
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const apiKeyToUse = this.apiAuthService.getApiKey(settings, frontmatter.aiService as string);

    if (Platform.isMobile) {
      new Notice(`[ChatGPT MD] Calling ${frontmatter.model}`);
    } else {
      this.notificationService.showStatusBarMessage(
        `Calling ${frontmatter.model}... (use 'Stop AI Generation' to cancel)`,
        0
      );
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
      this.notificationService.clearStatusBar();
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

  public async inferTitle(editor: Editor, view: MarkdownView): Promise<void> {
    if (!view.file) {
      this.notificationService.showError("Cannot infer title without an active file.");
      return;
    }
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    const frontmatter = await editorService.getFrontmatter(view.file, settings);
    const aiService = this.serviceLocator.getAiApiService();

    if (!frontmatter.model) {
      this.notificationService.showWarning("Model not set in frontmatter, using default.");
      frontmatter.model = this.settingsService.getSettings().defaultChatFrontmatter;
    }

    this.notificationService.showStatusBarMessage(`Inferring title with ${frontmatter.model}...`, 0);

    try {
      const { messages } = await editorService.getMessagesFromEditor(editor, settings);
      const configForTitleInference = { ...settings, ...frontmatter };
      await aiService.inferTitle(view, configForTitleInference, messages, editorService);
    } catch (error) {
      this.notificationService.showError("Failed to infer title. Check the console for details.");
      console.error("[ChatGPT MD] Title inference error:", error);
    } finally {
      this.notificationService.clearStatusBar();
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
          frontmatter.model as string
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

  private async getFileContentParts(file: TFile): Promise<{ frontmatter: string; messageBlocks: string[] }> {
    const fileContent = await this.serviceLocator.getApp().vault.read(file);
    const fileCache = this.serviceLocator.getApp().metadataCache.getFileCache(file);
    const frontmatterEndOffset = fileCache?.frontmatterPosition?.end.offset ?? 0;

    const frontmatter = fileContent.substring(0, frontmatterEndOffset);
    const content = fileContent.substring(frontmatterEndOffset).trim();

    const messageBlocks = content ? content.split(new RegExp(`\\n*${HORIZONTAL_LINE_MD}\\n*`)) : [];

    return { frontmatter, messageBlocks: messageBlocks.filter(Boolean) };
  }

  public async updateMessage(file: TFile, messageIndex: number, newContent: string): Promise<void> {
    const { frontmatter, messageBlocks } = await this.getFileContentParts(file);

    if (messageIndex < 0 || messageIndex >= messageBlocks.length) {
      console.error(
        `[ChatGPT MD] Update failed: Invalid message index ${messageIndex} for ${messageBlocks.length} messages.`
      );
      throw new Error("Invalid message index.");
    }

    const originalMessageBlock = messageBlocks[messageIndex];
    const headerMatch = originalMessageBlock.match(/^#+\s*role::[\s\S]*?\n\n/m);

    if (!headerMatch) {
      console.error("[ChatGPT MD] Could not find message header in block:", originalMessageBlock);
      throw new Error("Could not preserve message header during edit.");
    }

    const header = headerMatch[0];
    messageBlocks[messageIndex] = `${header.trim()}\n\n${newContent.trim()}`;

    const newContentJoined = messageBlocks.join(`\n\n${HORIZONTAL_LINE_MD}\n\n`);
    const newFileContent = `${frontmatter}\n\n${newContentJoined}`;

    await this.serviceLocator.getApp().vault.modify(file, newFileContent);
  }

  public async deleteMessage(file: TFile, messageIndex: number): Promise<void> {
    const { frontmatter, messageBlocks } = await this.getFileContentParts(file);

    if (messageIndex < 0 || messageIndex >= messageBlocks.length) {
      console.error(
        `[ChatGPT MD] Delete failed: Invalid message index ${messageIndex} for ${messageBlocks.length} messages.`
      );
      throw new Error("Invalid message index.");
    }

    messageBlocks.splice(messageIndex, 1);

    const newContentJoined = messageBlocks.join(`\n\n${HORIZONTAL_LINE_MD}\n\n`);
    const newFileContent = `${frontmatter}${messageBlocks.length > 0 ? `\n\n${newContentJoined}` : ""}`;

    await this.serviceLocator.getApp().vault.modify(file, newFileContent);
  }
}
