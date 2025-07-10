import { Editor } from "obsidian";
import { Message } from "src/Models/Message";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import {
  HORIZONTAL_LINE_MD,
  MARKDOWN_LINKS_REGEX,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_IDENTIFIER,
  ROLE_USER,
  WIKI_LINKS_REGEX,
} from "src/Constants";
import { getHeadingPrefix, escapeRegExp } from "../Utilities/TextHelpers";

/**
 * Service responsible for all message-related operations
 * This consolidates functionality previously spread across multiple files
 */
export class MessageService {
  constructor(
    private fileService: FileService,
    private notificationService: NotificationService
  ) {}

  /**
   * Find links in a message
   */
  findLinksInMessage(message: string): { link: string; title: string }[] {
    const regexes = [
      { regex: WIKI_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 1 },
      { regex: MARKDOWN_LINKS_REGEX, fullMatchIndex: 0, titleIndex: 2 },
    ];

    const links: { link: string; title: string }[] = [];
    const seenTitles = new Set<string>();

    for (const { regex, fullMatchIndex, titleIndex } of regexes) {
      for (const match of message.matchAll(regex)) {
        const fullLink = match[fullMatchIndex];
        const linkTitle = match[titleIndex];

        // Skip URLs that start with http:// or https://
        if (
          linkTitle &&
          !seenTitles.has(linkTitle) &&
          !linkTitle.startsWith("http://") &&
          !linkTitle.startsWith("https://")
        ) {
          links.push({ link: fullLink, title: linkTitle });
          seenTitles.add(linkTitle);
        }
      }
    }

    return links;
  }

  /**
   * Split text into messages based on horizontal line separator
   */
  splitMessages(text: string | undefined): string[] {
    return text ? text.split(HORIZONTAL_LINE_MD) : [];
  }

  /**
   * Remove YAML frontmatter from text using a more robust approach
   */
  removeYAMLFrontMatter(note: string | undefined): string | undefined {
    if (!note) return note;

    // Check if the note starts with frontmatter
    if (!note.trim().startsWith("---")) {
      return note;
    }

    // Find the end of frontmatter
    const lines = note.split("\n");
    let endIndex = -1;

    // Skip first line (opening ---)
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        endIndex = i;
        break;
      }
    }

    if (endIndex === -1) {
      // No closing ---, return original note
      return note;
    }

    // Return content after frontmatter
    return lines
      .slice(endIndex + 1)
      .join("\n")
      .trim();
  }

  /**
   * Remove comments from messages
   */
  removeCommentsFromMessages(message: string): string {
    try {
      const commentBlock = /=begin-chatgpt-md-comment[\s\S]*?=end-chatgpt-md-comment/g;
      return message.replace(commentBlock, "");
    } catch (err) {
      this.notificationService.showError("Error removing comments from messages: " + err);
      return message;
    }
  }

  /**
   * Extract role and content from a message
   */
  extractRoleAndMessage(message: string): Message {
    try {
      if (!message.includes(ROLE_IDENTIFIER)) {
        return {
          role: ROLE_USER,
          content: message,
        };
      }

      const [roleSection, ...contentSections] = message.split(ROLE_IDENTIFIER)[1].split("\n");
      const cleanedRole = this.cleanupRole(roleSection);

      return {
        role: cleanedRole,
        content: contentSections.join("\n").trim(),
      };
    } catch (error) {
      this.notificationService.showError("Failed to extract role and message: " + error);
      return {
        role: ROLE_USER,
        content: message,
      };
    }
  }

  /**
   * Clean up role string to standardized format
   */
  private cleanupRole(role: string): string {
    const trimmedRole = role.trim().toLowerCase();
    const roles = [ROLE_USER, ROLE_ASSISTANT];
    const foundRole = roles.find((r) => trimmedRole.includes(r));

    if (foundRole) {
      return foundRole;
    }

    this.notificationService.showWarning(`Unknown role: "${role}", defaulting to user`);
    return ROLE_USER;
  }

  /**
   * Clean messages from the editor content
   */
  cleanMessages(content: string): string[] {
    const messages = this.splitMessages(this.removeYAMLFrontMatter(content));
    return messages.map((msg) => this.removeCommentsFromMessages(msg));
  }

  /**
   * Get messages from the editor
   */
  async getMessagesFromEditor(
    editor: Editor,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    return this.getMessages(editor.getValue(), settings);
  }

  /**
   * Get messages from a string content
   */
  async getMessages(
    content: string,
    settings: ChatGPT_MDSettings
  ): Promise<{
    messages: string[];
    messagesWithRole: Message[];
  }> {
    // 1. Get raw message strings from the content, split by horizontal rules.
    const rawMessages = this.cleanMessages(content);

    // 2. For each raw message, extract its role and content.
    // At this point, content still contains wikilinks like `[[...]]`.
    let messagesWithRole: Message[] = rawMessages.map((msg) => this.extractRoleAndMessage(msg));

    // 3. Asynchronously process each message to resolve and inline wikilinks.
    messagesWithRole = await Promise.all(
      messagesWithRole.map(async (message) => {
        // Find all links in the current message's content.
        const links = this.findLinksInMessage(message.content);
        let updatedContent = message.content;

        // Iterate over found links and replace them with the content of the linked note.
        for (const link of links) {
          try {
            const linkedNoteContent = await this.fileService.getLinkedNoteContent(link.title);

            if (linkedNoteContent) {
              // The content of the linked note is processed to remove its own frontmatter.
              // It is then treated as plain text and injected.
              const processedContent = this.removeYAMLFrontMatter(linkedNoteContent);

              if (processedContent) {
                // Replace the wikilink placeholder with the actual content.
                updatedContent = updatedContent.replace(
                  new RegExp(escapeRegExp(link.link), "g"),
                  `${NEWLINE}${link.title}${NEWLINE}${processedContent}${NEWLINE}`
                );
              }
            } else {
              console.warn(`Could not fetch linked note content for: ${link.link}`);
            }
          } catch (error) {
            console.error(error);
          }
        }

        // Return a new message object with the updated content.
        return {
          ...message,
          content: updatedContent,
        };
      })
    );

    // Reconstruct the `messages` string array for backward compatibility (e.g., for title inference).
    const messages = messagesWithRole.map((m) => m.content);

    return { messages, messagesWithRole };
  }

  /**
   * Add system commands to messages
   */
  addSystemCommandsToMessages(messagesWithRole: Message[], systemCommands: string[] | null): Message[] {
    if (!systemCommands || systemCommands.length === 0) {
      return messagesWithRole;
    }

    // Add system commands to the beginning of the list
    const systemMessages = systemCommands.map((command) => ({
      role: "system",
      content: command,
    }));

    return [...systemMessages, ...messagesWithRole];
  }

  /**
   * Get a header role string
   */
  getHeaderRole(headingPrefix: string, role: string, model?: string): string {
    return `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}${headingPrefix}${ROLE_IDENTIFIER}${role}${
      model ? `<span style="font-size: small;"> (${model})</span>` : ``
    }${NEWLINE}`;
  }

  /**
   * Check if a code block is unfinished
   */
  unfinishedCodeBlock(text: string): boolean {
    const codeBlockMatches = text.match(/```/g);
    return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
  }

  /**
   * Format a message for display
   */
  formatMessage(message: Message, headingLevel: number, model?: string): string {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const roleHeader = this.getHeaderRole(headingPrefix, message.role, model);
    return `${roleHeader}${message.content}`;
  }

  /**
   * Append a message to the editor
   */
  appendMessage(editor: Editor, message: string, headingLevel: number): void {
    const headingPrefix = getHeadingPrefix(headingLevel);
    const assistantRoleHeader = this.getHeaderRole(headingPrefix, ROLE_ASSISTANT);
    const userRoleHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    editor.replaceRange(`${assistantRoleHeader}${message}${userRoleHeader}`, editor.getCursor());
  }

  /**
   * Process an AI response and update the editor
   */
  processResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    if (response.mode === "streaming") {
      // Only add user section if streaming was not aborted
      if (!response.wasAborted) {
        this.processStreamingResponse(editor, settings);
      }
    } else {
      this.processStandardResponse(editor, response, settings);
    }
  }

  /**
   * Process a streaming response
   */
  private processStreamingResponse(editor: Editor, settings: ChatGPT_MDSettings): void {
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const newLine = this.getHeaderRole(headingPrefix, ROLE_USER);
    editor.replaceRange(newLine, editor.getCursor());

    // move cursor to end of completion
    const cursor = editor.getCursor();
    const newCursor = {
      line: cursor.line,
      ch: cursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);
  }

  /**
   * Process a standard (non-streaming) response
   */
  private processStandardResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    // Extract response text and model name
    const responseStr = typeof response === "object" ? response.fullString || response : response;
    const model = typeof response === "object" ? response.model : undefined;

    // Format response text (add closing code block if needed)
    const formattedResponse = this.unfinishedCodeBlock(responseStr) ? responseStr + "\n```" : responseStr;

    // Create headers with model name if available
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const assistantHeader = this.getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
    const userHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    // Insert the response
    editor.replaceRange(`${assistantHeader}${formattedResponse}${userHeader}`, editor.getCursor());
  }

  appendUserMessage(editor: Editor, message: string, settings: ChatGPT_MDSettings): void {
    const editorContent = editor.getValue();
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const emptyUserHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    const lastLine = editor.lastLine();
    editor.setCursor({ line: lastLine + 1, ch: 0 });

    if (editorContent.trimEnd().endsWith(emptyUserHeader.trim())) {
      editor.replaceRange(message, editor.getCursor());
    } else {
      editor.replaceRange(emptyUserHeader + message, editor.getCursor());
    }
  }
}
