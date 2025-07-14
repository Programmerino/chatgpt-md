import { ROLE_ASSISTANT, AI_SERVICE_OPENAI } from "src/Constants";
import { Editor, EditorPosition } from "obsidian";
import { NotificationService } from "./NotificationService";
import { getHeaderRole, unfinishedCodeBlock, calculateEndPosition } from "src/Utilities/TextHelpers";

interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onDone: (fullText: string) => void;
}

export class ApiResponseParser {
  private notificationService: NotificationService;

  constructor(notificationService?: NotificationService) {
    this.notificationService = notificationService || new NotificationService();
  }

  getAssistantHeader(headingPrefix: string, model: string): string {
    return getHeaderRole(headingPrefix, ROLE_ASSISTANT, model);
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
      return json.choices?.[0]?.delta?.content ?? null;
    } catch (e) {
      return null;
    }
  }

  async processStreamResponse(
    response: Response,
    serviceType: string,
    editor: Editor | undefined,
    streamEndTracker: { current: EditorPosition | undefined },
    callbacks?: StreamCallbacks
  ): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";

    // This loop will be broken externally by an AbortError if cancelled.
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n");

      for (const line of lines) {
        const contentChunk = this.processStreamLine(line);
        if (contentChunk) {
          text += contentChunk;
          if (editor && streamEndTracker.current) {
            editor.replaceRange(contentChunk, streamEndTracker.current);
            streamEndTracker.current = calculateEndPosition(streamEndTracker.current, contentChunk);
          }
          callbacks?.onChunk(contentChunk);
        }
      }
    }

    const openFence = unfinishedCodeBlock(text);
    if (openFence) {
      this.notificationService.showWarning("Unclosed code block detected. Appending closing fence.");
      const finalChunk = `\n${openFence}`;
      text += finalChunk;
      if (editor && streamEndTracker.current) {
        editor.replaceRange(finalChunk, streamEndTracker.current);
        streamEndTracker.current = calculateEndPosition(streamEndTracker.current, finalChunk);
      }
      callbacks?.onChunk(finalChunk);
    }

    callbacks?.onDone(text);

    return text;
  }
}
