import { App, Editor, Notice } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { ChatTemplatesSuggestModal } from "src/Views/ChatTemplatesSuggestModal";
import { CHAT_FOLDER_TYPE, CHAT_TEMPLATE_FOLDER_TYPE } from "src/Constants";
import { FileService } from "./FileService";

/**
 * Service responsible for template management
 */
export class TemplateService {
  constructor(
    private app: App,
    private fileService: FileService
  ) {}

  /**
   * Create a new chat from a template
   */
  async createNewChatFromTemplate(settings: ChatGPT_MDSettings, fileName: string): Promise<void> {
    try {
      if (!settings.chatFolder || settings.chatFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat folder value found. Please set one in settings.`);
        return;
      }

      if (!settings.chatTemplateFolder || settings.chatTemplateFolder.trim() === "") {
        new Notice(`[ChatGPT MD] No chat template folder value found. Please set one in settings.`);
        return;
      }

      const chatFolderExists = await this.fileService.ensureFolderExists(settings.chatFolder, CHAT_FOLDER_TYPE);
      if (!chatFolderExists) {
        return;
      }

      const templateFolderExists = await this.fileService.ensureFolderExists(
        settings.chatTemplateFolder,
        CHAT_TEMPLATE_FOLDER_TYPE
      );
      if (!templateFolderExists) {
        return;
      }

      new ChatTemplatesSuggestModal(this.app, settings, fileName).open();
    } catch (err) {
      console.error(`[ChatGPT MD] Error in Create new chat from template`, err);
      new Notice(`[ChatGPT MD] Error in Create new chat from template, check console`);
    }
  }
}
