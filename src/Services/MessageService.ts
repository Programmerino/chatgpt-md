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
import {
  getHeadingPrefix,
  escapeRegExp,
  unfinishedCodeBlock,
  extractRoleAndMessage,
  splitMessages,
  removeYAMLFrontMatter,
} from "../Utilities/TextHelpers";

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
   * Clean messages from the editor content
   */
  cleanMessages(content: string): string[] {
    return splitMessages(removeYAMLFrontMatter(content));
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
    let messagesWithRole: Message[] = rawMessages.map((msg) => extractRoleAndMessage(msg));

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
              const processedContent = removeYAMLFrontMatter(linkedNoteContent);

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

    // Reconstruct the `messages` string array for backward compatibility.
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
    const userHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    // Get the very end of the document to ensure insertion at the correct place
    const lastLineIndex = editor.lastLine();
    const endOfDocCursor = { line: lastLineIndex, ch: editor.getLine(lastLineIndex).length };

    // Insert the new user prompt at the end of the document, regardless of current cursor
    editor.replaceRange(userHeader, endOfDocCursor);
  }

  /**
   * Process a standard (non-streaming) response
   */
  private processStandardResponse(editor: Editor, response: any, settings: ChatGPT_MDSettings): void {
    const responseStr = typeof response === "object" ? response.fullString || response : response;
    const model = typeof response === "object" ? response.model : undefined;
    const openFence = unfinishedCodeBlock(responseStr);
    const formattedResponse = openFence ? responseStr + `\n${openFence}` : responseStr;
    const headingPrefix = getHeadingPrefix(settings.headingLevel);
    const assistantHeader = this.getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
    const userHeader = this.getHeaderRole(headingPrefix, ROLE_USER);

    // Get the very end of the document to ensure insertion at the correct place
    const lastLineIndex = editor.lastLine();
    const endOfDocCursor = { line: lastLineIndex, ch: editor.getLine(lastLineIndex).length };

    // Insert the response and the next user prompt at the end of the document
    editor.replaceRange(`${assistantHeader}${formattedResponse}${userHeader}`, endOfDocCursor);
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
