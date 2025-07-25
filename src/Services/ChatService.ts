import { Editor, MarkdownView, Notice, Platform, TFile } from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { SettingsService } from "./SettingsService";
import { getHeadingPrefix, splitMessages } from "../Utilities/TextHelpers";
import { HORIZONTAL_LINE_MD, ROLE_ASSISTANT, ROLE_USER } from "src/Constants";
import { ApiAuthService } from "./ApiAuthService";
import { MessageService } from "./MessageService";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { EditorService } from "./EditorService";
import { Message } from "src/Models/Message";

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
    messagesWithRole: Message[],
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
      const { messagesWithRole } = await editorService.getMessagesFromEditor(editor, settings);

      editorService.moveCursorToEnd(editor);

      const response = await this._callAndProcessAI(view.file, messagesWithRole, frontmatter, settings, editor);

      // This is for editor-initiated chats. The full response is already streamed in.
      // We just need to add the next user prompt.
      editorService.processResponse(editor, response, settings);
    } catch (err) {
      if (err.name === "AbortError") {
        new Notice("Request cancelled.");
      } else {
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

      // 4. For non-streaming, manually trigger the onDone callback with the full response
      if (frontmatter.stream === false) {
        callbacks.onDone(response.fullString);
      }

      // 5. Append the full response to the file now that streaming is complete.
      if (response) {
        const assistantHeader = this.messageService.getHeaderRole(
          getHeadingPrefix(settings.headingLevel),
          ROLE_ASSISTANT,
          frontmatter.model as string
        );
        const fullResponseText = `${assistantHeader}${response.fullString}`;
        await vault.append(file, fullResponseText);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        callbacks.onDone(""); // Clear UI placeholder
        throw err; // Re-throw to be handled by the UI
      }
      callbacks.onDone("An error occurred. Please check the console for details.");
      console.error("[ChatGPT MD] Chat processing error:", err);
      new Notice(`[ChatGPT MD] Error: ${err.message}`);
    } finally {
      this.streaming = false;
    }
  }

  public async regenerateResponse(file: TFile, fromMessageIndex: number, callbacks: StreamCallbacks) {
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }
    this.streaming = true;
    const editorService = this.serviceLocator.getEditorService();
    const settings = this.settingsService.getSettings();
    const vault = this.serviceLocator.getApp().vault;

    try {
      const { frontmatter, messageBlocks } = await this.getFileContentParts(file);

      if (fromMessageIndex < 0 || fromMessageIndex >= messageBlocks.length) {
        throw new Error("Invalid message index for regeneration.");
      }

      const messagesToKeep = messageBlocks.slice(0, fromMessageIndex + 1);
      const contentWithMessagesToKeep = messagesToKeep.join(`\n\n${HORIZONTAL_LINE_MD}\n\n`);
      const fileContentToProcess = `${frontmatter}\n\n${contentWithMessagesToKeep}`;

      const { messagesWithRole } = await editorService.getMessagesFromFileContent(fileContentToProcess, settings);
      const frontmatterData = await editorService.getFrontmatter(file, settings);

      const truncatedFileContent = `${
        frontmatter.trim() ? `${frontmatter.trim()}\n\n` : ""
      }${contentWithMessagesToKeep}`;
      await vault.process(file, () => truncatedFileContent);

      const response = await this._callAndProcessAI(
        file,
        messagesWithRole,
        frontmatterData,
        settings,
        undefined,
        callbacks
      );

      if (frontmatterData.stream === false) {
        callbacks.onDone(response.fullString);
      }

      if (response) {
        const assistantHeader = this.messageService.getHeaderRole(
          getHeadingPrefix(settings.headingLevel),
          ROLE_ASSISTANT,
          frontmatterData.model as string
        );
        const fullResponseText = `${assistantHeader}${response.fullString}`;
        await vault.append(file, fullResponseText);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        callbacks.onDone(""); // Clear UI placeholder
        throw err; // Re-throw to be handled by the UI
      }
      callbacks.onDone("An error occurred. Check console.");
      console.error("[ChatGPT MD] Chat regeneration error:", err);
      new Notice(`[ChatGPT MD] Error: ${err.message}`);
    } finally {
      this.streaming = false;
    }
  }

  public async regenerateResponseInPlace(file: TFile, assistantMessageIndex: number, callbacks: StreamCallbacks) {
    if (this.streaming) {
      new Notice("A chat is already in progress.");
      return;
    }
    this.streaming = true;

    try {
      const editorService = this.serviceLocator.getEditorService();
      const settings = this.settingsService.getSettings();

      const { frontmatter, messageBlocks } = await this.getFileContentParts(file);
      if (assistantMessageIndex <= 0 || assistantMessageIndex >= messageBlocks.length) {
        throw new Error("Invalid message index for in-place regeneration.");
      }

      const messagesForContext = messageBlocks.slice(0, assistantMessageIndex);
      const contentForContext = `${frontmatter}\n\n${messagesForContext.join(`\n\n${HORIZONTAL_LINE_MD}\n\n`)}`;

      const { messagesWithRole } = await editorService.getMessagesFromFileContent(contentForContext, settings);
      const frontmatterData = await editorService.getFrontmatter(file, settings);

      const response = await this._callAndProcessAI(
        file,
        messagesWithRole,
        frontmatterData,
        settings,
        undefined,
        callbacks
      );

      if (response) {
        await this.updateMessage(file, assistantMessageIndex, response.fullString);
      }
    } catch (err) {
      throw err;
    } finally {
      this.streaming = false;
    }
  }

  public async clearChat(file: TFile): Promise<void> {
    if (!file) {
      throw new Error("File not provided to clearChat");
    }
    const { frontmatter } = await this.getFileContentParts(file);
    const newContent = frontmatter.trim() ? `${frontmatter.trim()}\n\n` : "";
    await this.serviceLocator.getApp().vault.process(file, () => newContent);
  }

  public async getFileContentParts(
    file: TFile,
    fileContent?: string
  ): Promise<{ frontmatter: string; messageBlocks: string[] }> {
    const contentToParse = fileContent ?? (await this.serviceLocator.getApp().vault.read(file));
    const fileCache = this.serviceLocator.getApp().metadataCache.getFileCache(file);
    const frontmatterEndOffset = fileCache?.frontmatterPosition?.end.offset ?? 0;

    const frontmatter = contentToParse.substring(0, frontmatterEndOffset);
    const content = contentToParse.substring(frontmatterEndOffset).trim();

    const messageBlocks = splitMessages(content);

    return { frontmatter, messageBlocks };
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

    await this.serviceLocator.getApp().vault.process(file, () => newFileContent);
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

    await this.serviceLocator.getApp().vault.process(file, () => newFileContent);
  }
}
