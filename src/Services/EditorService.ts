import { App, Editor, MarkdownView, TFile } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { EditorContentService } from "./EditorContentService";
import { MessageService } from "./MessageService";
import { TemplateService } from "./TemplateService";
import { FrontmatterService } from "./FrontmatterService";
import { NotificationService } from "./NotificationService";
import { Message } from "src/Models/Message";

/**
 * Service responsible for editor operations
 */
export class EditorService {
  private fileService: FileService;
  private editorContentService: EditorContentService;
  private messageService: MessageService;
  private templateService: TemplateService;
  private frontmatterService: FrontmatterService;

  constructor(
    private app: App,
    fileService?: FileService,
    editorContentService?: EditorContentService,
    messageService?: MessageService,
    templateService?: TemplateService,
    frontmatterService?: FrontmatterService
  ) {
    // Initialize services if not provided
    this.fileService = fileService || new FileService(app);
    this.editorContentService = editorContentService || new EditorContentService(app);
    const notificationService = new NotificationService();
    this.messageService = messageService || new MessageService(this.fileService, notificationService);

    // FrontmatterService now requires FrontmatterManager, so it must be provided
    if (!frontmatterService) {
      throw new Error("FrontmatterService must be provided as it requires FrontmatterManager dependency");
    }
    this.frontmatterService = frontmatterService;

    this.templateService = templateService || new TemplateService(app, this.fileService, this.editorContentService);
  }

  // FileService delegations

  async writeInferredTitle(view: MarkdownView, title: string): Promise<void> {
    return this.fileService.writeInferredTitle(view, title);
  }

  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    return this.fileService.ensureFolderExists(folderPath, folderType);
  }

  getDate(date: Date, format: string): string {
    return this.fileService.formatDate(date, format);
  }

  // EditorContentService delegations

  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    this.editorContentService.addHorizontalRule(editor, role, headingLevel);
  }

  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    this.editorContentService.addCommentBlock(editor, commentStart, commentEnd);
  }

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

  async createNewChatWithHighlightedText(editor: Editor, settings: ChatGPT_MDSettings): Promise<void> {
    return this.templateService.createNewChatWithHighlightedText(editor, settings);
  }

  // FrontmatterService delegations

  async getFrontmatter(file: TFile | null, settings: ChatGPT_MDSettings): Promise<any> {
    return await this.frontmatterService.getFrontmatter(file, settings);
  }

  // ResponseProcessingService delegations

  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    this.messageService.processResponse(editor, response, settings);
  }

  /**
   * Set the model in the front matter of the active file
   */
  async setModel(view: MarkdownView, modelName: string): Promise<void> {
    if (!view.file) {
      throw new Error("Cannot set model: No active file.");
    }
    await this.frontmatterService.updateFrontmatterField(view.file, "model", modelName);
  }
}
