import { App, Editor, MarkdownView } from "obsidian";
import { FrontmatterManager } from "src/Services/FrontmatterManager";

/**
 * Service responsible for editor content manipulation
 */
export class EditorContentService {
  private frontmatterManager?: FrontmatterManager;

  constructor(private app?: App) {
    if (app) {
      this.frontmatterManager = new FrontmatterManager(app);
    }
  }

  /**
   * Clear the chat content, preserving frontmatter using FrontmatterManager
   */
  async clearChat(editor: Editor): Promise<void> {
    let frontmatterContent = "";
    const activeView = this.app?.workspace.getActiveViewOfType(MarkdownView);
    const file = activeView?.file;

    if (file && this.app) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache?.frontmatterPosition) {
        const fileContent = await this.app.vault.read(file);
        frontmatterContent =
          fileContent.substring(cache.frontmatterPosition.start.offset, cache.frontmatterPosition.end.offset) + "\n\n";
      }
    }

    editor.setValue(frontmatterContent);

    // Position cursor at the end of the document
    if (frontmatterContent) {
      const lineCount = frontmatterContent.trimEnd().split("\n").length;
      editor.setCursor({ line: lineCount, ch: 0 });
    } else {
      editor.setCursor({ line: 0, ch: 0 });
    }
  }

  /**
   * Move the cursor to the end of the document
   */
  moveCursorToEnd(editor: Editor): void {
    try {
      const length = editor.lastLine();

      const newCursor = {
        line: length + 1,
        ch: 0,
      };
      editor.setCursor(newCursor);
    } catch (err) {
      throw new Error("Error moving cursor to end of file" + err);
    }
  }
}
