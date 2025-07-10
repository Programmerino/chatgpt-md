import {
  ItemView,
  WorkspaceLeaf,
  MarkdownView,
  Notice,
  setIcon,
  MarkdownRenderer,
  TFile,
  debounce,
  Editor,
} from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { Message } from "../Models/Message";
import { ChatService } from "src/Services/ChatService";

export const CHAT_SIDE_VIEW_TYPE = "chat-side-view";

export class ChatSideView extends ItemView {
  private serviceLocator: ServiceLocator;
  private chatService: ChatService;
  private messageContainer: HTMLElement;
  private inputForm: HTMLFormElement;
  private textInput: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private isRendering = false;
  private currentAssistantMessageEl: HTMLElement | null = null;
  private currentAssistantMessageContent = "";
  private currentChatFile: TFile | null = null;

  constructor(leaf: WorkspaceLeaf, serviceLocator: ServiceLocator) {
    super(leaf);
    this.serviceLocator = serviceLocator;
    this.chatService = serviceLocator.getChatService();
    this.icon = "message-square";
  }

  getViewType(): string {
    return CHAT_SIDE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "ChatGPT MD Chat";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("chat-view-container");

    this.messageContainer = container.createDiv({ cls: "chat-messages" });

    const inputContainer = container.createDiv({ cls: "chat-input-container" });
    this.inputForm = inputContainer.createEl("form");
    this.textInput = this.inputForm.createEl("textarea", {
      placeholder: "Type your message...",
    });
    this.sendButton = this.inputForm.createEl("button", { type: "submit" });
    setIcon(this.sendButton, "send");

    this.inputForm.onsubmit = (e) => {
      e.preventDefault();
      this.handleSendMessage();
    };

    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSendMessage();
      }
    });

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof MarkdownView && leaf.view.file) {
          this.currentChatFile = leaf.view.file;
          this.renderConversation();
        }
      })
    );
    this.registerEvent(
      this.app.workspace.on(
        "editor-change",
        debounce(
          (_editor: Editor, view: MarkdownView) => {
            // Re-render if the change happened in the file this view is tracking
            if (view.file && this.currentChatFile && view.file.path === this.currentChatFile.path) {
              this.renderConversation();
            }
          },
          300,
          true
        )
      )
    );

    this.renderConversation();
  }

  async onClose() {
    // Cleanup if needed
  }

  async renderConversation() {
    if (this.isRendering) return;
    this.isRendering = true;

    try {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file) {
        this.currentChatFile = activeView.file;
      }

      this.messageContainer.empty();

      if (!this.currentChatFile) {
        this.messageContainer.createEl("p", {
          text: "Open a chat note to see the conversation here.",
          cls: "chat-view-placeholder",
        });
        this.textInput.disabled = true;
        return;
      }

      this.textInput.disabled = false;
      let fileContent: string;

      // Prefer live content from the active editor.
      if (activeView && activeView.file?.path === this.currentChatFile.path) {
        fileContent = activeView.editor.getValue();
      } else {
        // Fallback to reading from vault for non-active files.
        fileContent = await this.app.vault.read(this.currentChatFile);
      }

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.serviceLocator.getSettingsService().getSettings();
      const { messagesWithRole } = await editorService.getMessagesFromFileContent(fileContent, settings);

      for (const message of messagesWithRole) {
        if (message.content.trim() === "") continue;
        this.addMessageToView(message);
      }
    } catch (error) {
      console.error("Error rendering conversation in side view:", error);
    } finally {
      this.isRendering = false;
      this.scrollToBottom();
    }
  }

  addMessageToView(message: Message): HTMLElement {
    const messageEl = this.messageContainer.createDiv({
      cls: `chat-message ${message.role}`,
    });
    const contentEl = messageEl.createDiv({ cls: "chat-message-content" });

    MarkdownRenderer.render(this.app, message.content, contentEl, "", this);
    this.scrollToBottom();
    return messageEl;
  }

  private startNewAssistantMessage() {
    this.currentAssistantMessageContent = "";
    this.currentAssistantMessageEl = this.addMessageToView({
      role: "assistant",
      content: "...",
    });
  }

  private appendChunkToView(chunk: string) {
    if (!this.currentAssistantMessageEl) {
      this.startNewAssistantMessage();
    }
    this.currentAssistantMessageContent += chunk;
    const contentEl = this.currentAssistantMessageEl!.querySelector(".chat-message-content");
    if (contentEl) {
      contentEl.empty();
      contentEl.createEl("p", {
        text: this.currentAssistantMessageContent + "...",
      }); // Simple text for streaming performance
      this.scrollToBottom();
    }
  }

  private finalizeAssistantMessage(fullText: string) {
    this.currentAssistantMessageContent = fullText;
    if (this.currentAssistantMessageEl) {
      const contentEl = this.currentAssistantMessageEl.querySelector(".chat-message-content");
      if (contentEl) {
        contentEl.empty();
        MarkdownRenderer.render(this.app, this.currentAssistantMessageContent, contentEl as HTMLElement, "", this);
        this.scrollToBottom();
      }
    }
    this.currentAssistantMessageEl = null;
    this.currentAssistantMessageContent = "";
  }

  private async handleSendMessage() {
    const message = this.textInput.value.trim();
    if (!message || this.chatService.isStreaming()) return;

    if (!this.currentChatFile) {
      new Notice("No chat note is active to send a message to.");
      return;
    }

    this.textInput.value = "";
    this.addMessageToView({ role: "user", content: message });
    this.startNewAssistantMessage();

    await this.chatService.sendMessageFromSidebar(message, this.currentChatFile, {
      onChunk: (chunk: string) => this.appendChunkToView(chunk),
      onDone: (fullText) => this.finalizeAssistantMessage(fullText),
    });
  }

  private scrollToBottom() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }
}
