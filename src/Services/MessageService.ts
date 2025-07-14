import { Editor, TFile } from "obsidian";
import { Message } from "src/Models/Message";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { FileService } from "./FileService";
import { NotificationService } from "./NotificationService";
import { HORIZONTAL_LINE_MD, NEWLINE, ROLE_ASSISTANT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import {
  getHeadingPrefix,
  unfinishedCodeBlock,
  extractRoleAndMessage,
  splitMessages,
  removeYAMLFrontMatter,
} from "../Utilities/TextHelpers";

// Interface to hold a regex match and its type for clear processing
interface LinkMatch {
  match: RegExpMatchArray;
  type: "embed" | "wikilink";
}

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
   * Get messages from a string content, processing and inlining wikilinks and embeds.
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
    let messagesWithRole: Message[] = rawMessages.map((msg) => extractRoleAndMessage(msg));

    // 3. Asynchronously process each message to resolve and inline wikilinks.
    messagesWithRole = await Promise.all(
      messagesWithRole.map(async (message) => {
        const currentContent = message.content;

        const embedRegex = /\!\[\[([^|\]\n]+)(?:\|.*)?\]\]/g;
        const wikilinkRegex = /(?<!\!)\[\[([^|\]\n]+)(?:\|.*)?\]\]/g;

        // Find all matches and tag them with their type.
        const embedMatches: LinkMatch[] = Array.from(currentContent.matchAll(embedRegex)).map((m) => ({
          match: m,
          type: "embed",
        }));
        const wikilinkMatches: LinkMatch[] = Array.from(currentContent.matchAll(wikilinkRegex)).map((m) => ({
          match: m,
          type: "wikilink",
        }));

        const allMatches = [...embedMatches, ...wikilinkMatches].sort((a, b) => a.match.index! - b.match.index!);

        if (allMatches.length === 0) {
          return message;
        }

        // Rebuild the content string by replacing links part-by-part.
        const newContentParts: string[] = [];
        let lastIndex = 0;

        for (const { match, type } of allMatches) {
          // Add text before the match
          newContentParts.push(currentContent.substring(lastIndex, match.index));

          const linktext = match[1].trim();
          let replacement = match[0]; // Default to original text if replacement fails

          try {
            if (type === "embed") {
              const linkedNoteContent = await this.fileService.getLinkedNoteContent(linktext);
              if (linkedNoteContent) {
                replacement = removeYAMLFrontMatter(linkedNoteContent) || "";
              }
            } else if (type === "wikilink") {
              const file = this.fileService.getFirstLinkpathDest(linktext, "");
              if (file instanceof TFile) {
                const linkedNoteContent = await this.fileService.readFile(file);
                const processedContent = removeYAMLFrontMatter(linkedNoteContent) || "";
                replacement = `\n\`\`\`md ${file.name}\n${processedContent.trim()}\n\`\`\`\n`;
              }
            }
          } catch (error) {
            console.error(`[ChatGPT MD] Failed to process link: ${match[0]}`, error);
          }

          newContentParts.push(replacement);
          lastIndex = match.index! + match[0].length;
        }

        // Add the remaining text after the last match
        newContentParts.push(currentContent.substring(lastIndex));

        // Return a new message object with the updated content.
        return {
          ...message,
          content: newContentParts.join(""),
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
      // Only add user section if streaming was successful
      this.processStreamingResponse(editor, settings);
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
