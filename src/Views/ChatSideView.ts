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
  private isAwaitingResponse = false;
  private currentMessagesCache: string = "[]";

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

  // This is the primary handler for tracking which file the sidebar should be displaying.
  private updateView = (): void => {
    // This is the key fix: prevent re-rendering from file changes
    // while we are streaming a response and using an optimistic UI.
    if (this.isAwaitingResponse) {
      return;
    }

    // getMostRecentLeaf is the key to stability. It finds the last active leaf
    // in the main editor area, ignoring focus shifts to sidebars or other UI elements.
    const mostRecentMarkdownLeaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);

    const newFile = mostRecentMarkdownLeaf?.view instanceof MarkdownView ? mostRecentMarkdownLeaf.view.file : null;

    if (this.currentChatFile?.path !== newFile?.path) {
      this.currentChatFile = newFile;
      this.currentMessagesCache = "[]"; // Force re-render for a new file.
    }

    // Always call renderConversation, as the content of the current file might have changed.
    this.renderConversation();
  };

  // A single debounced updater to prevent race conditions and event storms.
  private scheduleUpdate = debounce(this.updateView, 100, true);

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
    this.sendButton = this.inputForm.createEl("button", { type: "button" }); // Changed to type="button"
    this.setButtonState("idle");

    // Unified click handler for the button
    this.sendButton.onclick = (e) => {
      e.preventDefault();
      if (this.isAwaitingResponse) {
        console.log("[ChatGPT MD] Stop button clicked.");
        this.chatService.cancelRequest();
        new Notice("AI generation stopped.");
      } else {
        this.handleSendMessage();
      }
    };

    // Form submission now triggers the button click
    this.inputForm.onsubmit = (e) => {
      e.preventDefault();
      this.sendButton.click();
    };

    this.textInput.addEventListener("input", () => {
      if (!this.isAwaitingResponse) {
        this.sendButton.disabled = this.textInput.value.trim().length === 0;
      }
    });

    this.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendButton.click();
      }
    });

    // All relevant events will trigger the same debounced update function.
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.scheduleUpdate));
    this.registerEvent(this.app.workspace.on("editor-change", this.scheduleUpdate));

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.currentChatFile?.path === oldPath) {
          // No need to call updateView directly, just schedule it
          this.scheduleUpdate();
        }
      })
    );

    // Initial load
    this.scheduleUpdate();
  }

  async onClose() {
    // Cleanup if needed
  }

  private setButtonState(state: "idle" | "generating") {
    if (state === "generating") {
      this.isAwaitingResponse = true;
      this.sendButton.disabled = false;
      setIcon(this.sendButton, "square");
      this.sendButton.setAttribute("aria-label", "Stop generation");
      this.sendButton.classList.add("is-sending");
    } else {
      this.isAwaitingResponse = false;
      this.sendButton.disabled = this.textInput.value.trim().length === 0;
      setIcon(this.sendButton, "send");
      this.sendButton.setAttribute("aria-label", "Send message");
      this.sendButton.classList.remove("is-sending");
    }
  }

  async renderConversation() {
    if (this.isRendering && !this.isAwaitingResponse) return;
    this.isRendering = true;

    try {
      if (!this.currentChatFile) {
        this.messageContainer.empty();
        this.messageContainer.createEl("p", {
          text: "Open a chat note to see the conversation here.",
          cls: "chat-view-placeholder",
        });
        this.textInput.disabled = true;
        this.textInput.placeholder = "Open a chat note to start talking...";
        this.currentMessagesCache = "[]";
        return;
      }

      this.textInput.disabled = false;
      this.textInput.placeholder = "Type your message...";

      let fileContent: string;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      // If the current chat file is open in the active editor, use its content directly.
      // This is the most reliable way to get the latest content during edits.
      if (activeView && activeView.file?.path === this.currentChatFile.path) {
        fileContent = activeView.editor.getValue();
      } else {
        // Otherwise, read from the vault (for background updates).
        fileContent = await this.app.vault.read(this.currentChatFile);
      }

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.serviceLocator.getSettingsService().getSettings();
      const { messagesWithRole } = await editorService.getMessagesFromFileContent(fileContent, settings);

      const newMessagesCache = JSON.stringify(messagesWithRole);

      if (newMessagesCache === this.currentMessagesCache) {
        // No change in messages, so don't re-render.
        return;
      }

      this.currentMessagesCache = newMessagesCache;
      this.messageContainer.empty();

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

    const messageActions = messageEl.createDiv({ cls: "chat-message-actions" });
    const copyButton = messageActions.createEl("button", {
      cls: "chat-message-copy-button",
    });
    setIcon(copyButton, "copy");
    copyButton.setAttribute("aria-label", "Copy message");

    copyButton.addEventListener("click", () => {
      navigator.clipboard
        .writeText(message.content)
        .then(() => {
          new Notice("Copied to clipboard");
        })
        .catch((err) => {
          console.error("Failed to copy message: ", err);
          new Notice("Failed to copy message to clipboard");
        });
    });

    const contentEl = messageEl.createDiv({ cls: "chat-message-content" });

    MarkdownRenderer.render(this.app, message.content, contentEl, this.currentChatFile?.path || "", this);
    this.scrollToBottom();
    return messageEl;
  }

  private startNewAssistantMessage() {
    this.currentAssistantMessageContent = "";
    this.currentAssistantMessageEl = this.addMessageToView({
      role: "assistant",
      content: "▋",
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
      MarkdownRenderer.render(
        this.app,
        this.currentAssistantMessageContent + " ▋",
        contentEl as HTMLElement,
        this.currentChatFile?.path || "",
        this
      );
      this.scrollToBottom();
    }
  }

  private finalizeAssistantMessage(fullText: string) {
    if (!this.currentAssistantMessageEl) return;

    if (fullText.trim() === "") {
      this.currentAssistantMessageEl.remove();
    } else {
      const contentEl = this.currentAssistantMessageEl.querySelector(".chat-message-content");
      if (contentEl) {
        contentEl.empty();
        MarkdownRenderer.render(this.app, fullText, contentEl as HTMLElement, this.currentChatFile?.path || "", this);
        this.scrollToBottom();
      }
    }
    this.currentAssistantMessageEl = null;
    this.currentAssistantMessageContent = "";
  }

  private async handleSendMessage() {
    const message = this.textInput.value.trim();
    if (!message || this.isAwaitingResponse) return;

    if (!this.currentChatFile) {
      new Notice("No chat note is active to send a message to.");
      return;
    }

    this.textInput.value = "";
    this.setButtonState("generating");

    // Optimistic UI update
    this.addMessageToView({ role: "user", content: message });
    this.startNewAssistantMessage();

    try {
      await this.chatService.sendMessageFromSidebar(message, this.currentChatFile, {
        onChunk: (chunk: string) => this.appendChunkToView(chunk),
        onDone: (fullText: string) => this.finalizeAssistantMessage(fullText),
      });
    } catch (err) {
      console.error("[ChatGPT MD] Error sending message from sidebar:", err);
      this.finalizeAssistantMessage(""); // Clear the assistant bubble on error
      new Notice("An error occurred while sending the message. Check the console for details.");
    } finally {
      this.setButtonState("idle");
      this.textInput.focus();
      // Manually trigger a final update to sync the view with the file's ground truth.
      this.scheduleUpdate();
    }
  }

  private scrollToBottom() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }
}
