import { App, Editor, TFile } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { EditorContentService } from "./EditorContentService";
import { MessageService } from "./MessageService";
import { TemplateService } from "./TemplateService";
import { FrontmatterService } from "./FrontmatterService";
import { Message } from "src/Models/Message";

/**
 * Service responsible for editor operations
 */
export class EditorService {
  constructor(
    private app: App,
    private fileService: FileService,
    private editorContentService: EditorContentService,
    private messageService: MessageService,
    private templateService: TemplateService,
    private frontmatterService: FrontmatterService
  ) {}

  // FileService delegations

  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    return this.fileService.ensureFolderExists(folderPath, folderType);
  }

  getDate(date: Date, format: string): string {
    return this.fileService.formatDate(date, format);
  }

  // EditorContentService delegations

  async clearChat(editor: Editor): Promise<void> {
    await this.editorContentService.clearChat(editor);
  }

  moveCursorToEnd(editor: Editor): void {
    this.editorContentService.moveCursorToEnd(editor);
  }

  // MessageService delegations

  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    return this.messageService.getMessagesFromEditor(editor, settings);
  }

  async getMessagesFromFileContent(
    content: string,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    return this.messageService.getMessages(content, settings);
  }

  appendUserMessage(editor: Editor, message: string, settings: ChatGPT_MDSettings): void {
    this.messageService.appendUserMessage(editor, message, settings);
  }

  // TemplateService delegations

  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, fileName: string): Promise<void> {
    return this.templateService.createNewChatFromTemplate(settings, fileName);
  }

  // FrontmatterService delegations

  async getFrontmatter(file: TFile | null, settings: ChatGPT_MDSettings): Promise<Record<string, unknown>> {
    return await this.frontmatterService.getFrontmatter(file, settings);
  }

  // ResponseProcessingService delegations

  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    this.messageService.processResponse(editor, response, settings);
  }
}
