import { App, Editor, MarkdownView } from "obsidian";
import { getHeaderRole, getHeadingPrefix } from "src/Utilities/TextHelpers";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { HORIZONTAL_LINE_MD, NEWLINE, ROLE_ASSISTANT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";

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
   * Add a horizontal rule with a role header
   */
  addHorizontalRule(editor: Editor, role: string, headingLevel: number): void {
    const formattedContent = `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}${getHeadingPrefix(
      headingLevel
    )}${ROLE_IDENTIFIER}${role}${NEWLINE}`;

    const currentPosition = editor.getCursor();

    editor.replaceRange(formattedContent, currentPosition);
    editor.setCursor(currentPosition.line + formattedContent.split("\n").length - 1, 0);
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
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

  /**
   * Add a comment block at the cursor position
   */
  addCommentBlock(editor: Editor, commentStart: string, commentEnd: string): void {
    const cursor = editor.getCursor();
    const commentBlock = `${commentStart}${NEWLINE}${commentEnd}`;

    editor.replaceRange(commentBlock, cursor);

    // Move cursor to middle of comment block
    editor.setCursor({
      line: cursor.line + 1,
      ch: cursor.ch,
    });
  }
}
