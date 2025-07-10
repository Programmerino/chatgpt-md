import { ROLE_ASSISTANT, AI_SERVICE_OPENAI } from "src/Constants";
import { Editor } from "obsidian";
import { NotificationService } from "./NotificationService";
import { getHeaderRole, unfinishedCodeBlock } from "src/Utilities/TextHelpers";
import { ApiService } from "./ApiService";

interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export class ApiResponseParser {
  private notificationService: NotificationService;
  private collectedCitations: Set<string> = new Set();

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  insertAssistantHeader(
    editor: Editor,
    headingPrefix: string,
    model: string
  ): {
    initialCursor: { line: number; ch: number };
    newCursor: { line: number; ch: number };
  } {
    const newLine = getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);

    const initialCursor = editor.getCursor();
    editor.replaceRange(newLine, initialCursor);

    const newCursor = {
      line: initialCursor.line,
      ch: initialCursor.ch + newLine.length,
    };
    editor.setCursor(newCursor);

    return { initialCursor, newCursor };
  }

  parseNonStreamingResponse(data: any, serviceType: string): string {
    // Only handles OpenAI format now
    if (serviceType === AI_SERVICE_OPENAI) {
      return data.choices[0].message.content;
    }
    console.warn(`Unknown service type: ${serviceType}`);
    return data?.choices?.[0]?.message?.content || JSON.stringify(data);
  }

  private processStreamLine(line: string): string | null {
    if (line.trim() === "" || !line.startsWith("data:")) return null;

    try {
      const payloadString = line.substring("data:".length).trim();
      if (payloadString === "[DONE]") return null;

      const json = JSON.parse(payloadString);

      if (json.citations) {
        json.citations.forEach((c: string) => this.collectedCitations.add(c));
      }

      return json.choices?.[0]?.delta?.content ?? null;
    } catch (e) {
      return null;
    }
  }

  async processStreamResponse(
    response: Response,
    serviceType: string,
    editor: Editor | undefined,
    cursorPositions:
      | {
          initialCursor: { line: number; ch: number };
          newCursor: { line: number; ch: number };
        }
      | undefined,
    setAtCursor?: boolean,
    apiService?: ApiService,
    callbacks?: StreamCallbacks
  ): Promise<{ text: string; wasAborted: boolean }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let wasAborted = false;

    if (editor && !setAtCursor && cursorPositions) {
      editor.setCursor(cursorPositions.newCursor);
    }

    try {
      while (true) {
        if (apiService?.wasAborted()) {
          wasAborted = true;
          break;
        }

        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          const contentChunk = this.processStreamLine(line);
          if (contentChunk) {
            text += contentChunk;
            if (editor) {
              if (setAtCursor) {
                editor.replaceSelection(contentChunk);
              } else {
                editor.replaceRange(contentChunk, editor.getCursor());
              }
            }
            callbacks?.onChunk(contentChunk);
          }
        }
      }
    } catch (error) {
      console.error("Error processing stream:", error);
    }

    if (wasAborted) {
      apiService?.resetAbortedFlag();
      if (editor && cursorPositions) {
        editor.replaceRange("", cursorPositions.initialCursor, editor.getCursor());
      }
      callbacks?.onDone("");
      return { text: "", wasAborted: true };
    }

    if (unfinishedCodeBlock(text)) {
      const finalChunk = "\n```";
      text += finalChunk;
      if (editor) {
        editor.replaceRange(finalChunk, editor.getCursor());
      }
      callbacks?.onChunk(finalChunk);
    }

    if (this.collectedCitations.size > 0) {
      const citations = Array.from(this.collectedCitations)
        .map((c, i) => `${i + 1}. [${c}](${c})`)
        .join("\n");
      const citationsText = `\n\n**Sources:**\n${citations}`;
      text += citationsText;
      if (editor) {
        editor.replaceRange(citationsText, editor.getCursor());
      }
      callbacks?.onChunk(citationsText);
      this.collectedCitations.clear();
    }

    callbacks?.onDone(text);

    return { text, wasAborted };
  }
}
