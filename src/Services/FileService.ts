import { App, Notice, TFile, TFolder, moment } from "obsidian";
import { createFolderModal } from "src/Utilities/ModalHelpers";

/**
 * Service responsible for file and folder operations
 */
export class FileService {
  constructor(private app: App) {}

  /**
   * Create a new debug file with the given content and open it.
   */
  async createAndOpenDebugFile(content: string, originalFileName: string): Promise<void> {
    const timestamp = this.formatDate(new Date(), "YYYYMMDDhhmmss");
    const debugFileName = `DEBUG - ${originalFileName.replace(/\.md$/, "")} - ${timestamp}.md`;

    // Use the root of the vault for debug files for simplicity
    const debugFilePath = `/${debugFileName}`;

    try {
      const newFile = await this.createNewFile(debugFilePath, content);
      // Open the new file in a new pane
      await this.app.workspace.openLinkText(newFile.path, "", true);
    } catch (err) {
      new Notice(`[ChatGPT MD] Error creating debug file: ${err.message}`);
      console.error("[ChatGPT MD] Error creating debug file:", err);
    }
  }

  /**
   * Sanitize a file name by removing or replacing invalid characters
   * @param fileName The file name to sanitize
   * @returns The sanitized file name
   */
  sanitizeFileName(fileName: string): string {
    // Replace characters that are invalid in file names
    // These include: \ / : * ? " < > |
    return fileName.replace(/[\\/:*?"<>|]/g, "-");
  }

  /**
   * Ensure a folder exists, creating it if necessary
   */
  async ensureFolderExists(folderPath: string, folderType: string): Promise<boolean> {
    const exists = await this.app.vault.adapter.exists(folderPath);

    if (!exists) {
      const result = await createFolderModal(this.app, folderType, folderPath);
      if (!result) {
        new Notice(
          `[ChatGPT MD] No ${folderType} found. One must be created to use the plugin. Set one in settings and make sure it exists.`
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Create a new file with the given content
   */
  async createNewFile(filePath: string, content: string): Promise<TFile> {
    return this.app.vault.create(filePath, content);
  }

  /**
   * Read the contents of a file
   */
  async readFile(file: TFile): Promise<string> {
    return this.app.vault.read(file);
  }

  /**
   * Get the content of a linked note
   */
  async getLinkedNoteContent(linkPath: string): Promise<string | null> {
    try {
      const file = this.app.metadataCache.getFirstLinkpathDest(linkPath, "");
      return file ? await this.app.vault.read(file) : null;
    } catch (error) {
      console.error(`Error reading linked note: ${linkPath}`, error);
      return null;
    }
  }

  /**
   * Get the TFile for a given link path.
   * @param linkPath The link path to resolve
   * @param sourcePath The path of the file containing the link
   * @returns The resolved TFile, or null if not found
   */
  public getFirstLinkpathDest(linkPath: string, sourcePath: string = ""): TFile | null {
    return this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
  }

  /**
   * Format a date according to the given format
   */
  formatDate(date: Date, format: string): string {
    return moment(date).format(format);
  }
}
