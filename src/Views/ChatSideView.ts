import {
  ItemView,
  WorkspaceLeaf,
  MarkdownView,
  Notice,
  setIcon,
  MarkdownRenderer,
  TFile,
  debounce,
  Setting,
  Modal,
} from "obsidian";
import { ServiceLocator } from "../core/ServiceLocator";
import { Message } from "../Models/Message";
import { ChatService } from "src/Services/ChatService";
import { CommandRegistry } from "src/core/CommandRegistry";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";

export const CHAT_SIDE_VIEW_TYPE = "chat-side-view";

export class ChatSideView extends ItemView {
  private serviceLocator: ServiceLocator;
  private chatService: ChatService;
  private commandRegistry: CommandRegistry;

  private headerEl: HTMLElement;
  private paramsToggleBtn: HTMLElement;
  private paramsEl: HTMLElement;
  private messageContainer: HTMLElement;
  private editorContainer: HTMLElement;
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
    this.commandRegistry = serviceLocator.getCommandRegistry();
    this.icon = "message-square";
  }

  getViewType(): string {
    return CHAT_SIDE_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "ChatGPT MD Chat";
  }

  private updateView = async (): Promise<void> => {
    if (this.isAwaitingResponse) return;

    const mostRecentMarkdownLeaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
    const newFile = mostRecentMarkdownLeaf?.view instanceof MarkdownView ? mostRecentMarkdownLeaf.view.file : null;

    const fileChanged = this.currentChatFile?.path !== newFile?.path;
    this.currentChatFile = newFile;

    if (fileChanged) {
      this.currentMessagesCache = "[]";
    }

    if (this.currentChatFile) {
      await this.updateForActiveFile(this.currentChatFile, fileChanged);
    } else {
      this.updateForNoFile();
    }
  };

  private async updateForActiveFile(file: TFile, fileChanged: boolean) {
    this.textInput.disabled = false;
    this.textInput.placeholder = "Type your message...";
    this.updateHeader(file.basename);

    if (fileChanged) {
      this.paramsEl.style.display = "none";
      this.paramsToggleBtn?.removeClass("is-active");
    }

    await this.renderParameters();
    await this.renderConversation();
  }

  private updateForNoFile() {
    this.updateHeader("No Chat Open");
    this.paramsEl.empty();
    this.paramsEl.style.display = "none";
    this.messageContainer.empty();
    this.messageContainer.createEl("p", {
      text: "Open a chat note to see the conversation here.",
      cls: "chat-view-placeholder",
    });
    this.textInput.disabled = true;
    this.textInput.placeholder = "Open a chat note to start talking...";
  }

  private scheduleUpdate = debounce(this.updateView, 100, true);

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("chat-view-container");

    this.headerEl = container.createDiv({ cls: "chat-view-header" });
    this.paramsEl = container.createDiv({ cls: "chat-view-params", attr: { style: "display: none;" } });
    this.messageContainer = container.createDiv({ cls: "chat-messages" });
    this.editorContainer = container.createDiv({ cls: "chat-editor-container", attr: { style: "display: none;" } });

    const inputContainer = container.createDiv({ cls: "chat-input-container" });
    this.inputForm = inputContainer.createEl("form");
    this.textInput = this.inputForm.createEl("textarea", {
      placeholder: "Type your message...",
    });
    this.sendButton = this.inputForm.createEl("button", { type: "button" });
    this.setButtonState("idle");

    this.sendButton.onclick = (e) => {
      e.preventDefault();
      if (this.isAwaitingResponse) {
        this.chatService.cancelRequest();
      } else {
        this.handleSendMessage();
      }
    };

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

    this.registerEvent(this.app.workspace.on("active-leaf-change", this.scheduleUpdate));
    this.registerEvent(this.app.workspace.on("editor-change", this.scheduleUpdate));
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file === this.currentChatFile && !this.isAwaitingResponse) {
          this.scheduleUpdate();
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        if (this.currentChatFile?.path === oldPath) {
          this.scheduleUpdate();
        }
      })
    );

    this.scheduleUpdate();
  }

  async onClose() {
    // Cleanup if needed
  }

  private updateHeader(title: string) {
    this.headerEl.empty();
    this.headerEl.createEl("span", { text: title, cls: "chat-view-title" });
    if (this.currentChatFile) {
      const actionsContainer = this.headerEl.createDiv({ cls: "chat-view-header-actions" });

      const clearButton = actionsContainer.createEl("button", { cls: "chat-view-params-toggle" });
      setIcon(clearButton, "trash");
      clearButton.setAttribute("aria-label", "Clear chat history");
      clearButton.onclick = () => this.handleClearChat();

      this.paramsToggleBtn = actionsContainer.createEl("button", { cls: "chat-view-params-toggle" });
      setIcon(this.paramsToggleBtn, "settings-2");
      this.paramsToggleBtn.setAttribute("aria-label", "View & edit chat parameters");
      this.paramsToggleBtn.onclick = () => {
        const isHidden = this.paramsEl.style.display === "none";
        this.paramsEl.style.display = isHidden ? "block" : "none";
        this.paramsToggleBtn.toggleClass("is-active", isHidden);
      };
    }
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

  async renderParameters() {
    this.paramsEl.empty();
    if (!this.currentChatFile) return;

    const frontmatterService = this.serviceLocator.getFrontmatterService();
    const settings = this.serviceLocator.getSettingsService().getSettings();
    const frontmatter = (await frontmatterService.getFrontmatter(this.currentChatFile, settings)) as Record<
      string,
      any
    >;

    const debouncedUpdate = debounce(
      async (key: string, value: any) => {
        if (this.currentChatFile) {
          await frontmatterService.updateFrontmatterField(this.currentChatFile, key, value);
        }
      },
      500,
      true
    );

    new Setting(this.paramsEl).setName("Model").addDropdown((dd) => {
      this.commandRegistry.availableModels.forEach((model) => {
        dd.addOption(model, model);
      });
      dd.setValue(frontmatter.model || DEFAULT_OPENAI_CONFIG.model);
      dd.onChange((value) => debouncedUpdate("model", value));
    });

    new Setting(this.paramsEl)
      .setName("System Prompt")
      .setDesc("The instructions for the AI assistant.")
      .addTextArea((text) => {
        text.setValue(Array.isArray(frontmatter.system_commands) ? frontmatter.system_commands.join("\n") : "");
        text.inputEl.rows = 5;
        text.onChange((value) => {
          const commands = value.split("\n").filter((cmd) => cmd.trim() !== "");
          debouncedUpdate("system_commands", commands);
        });
      });

    new Setting(this.paramsEl)
      .setName("Temperature")
      .setDesc("Controls randomness. Lower is more deterministic.")
      .addSlider((slider) => {
        slider
          .setLimits(0, 2, 0.1)
          .setValue(frontmatter.temperature ?? 1.0)
          .setDynamicTooltip()
          .onChange((value) => debouncedUpdate("temperature", value));
      });
  }

  async renderConversation() {
    if (this.isRendering && !this.isAwaitingResponse) return;
    this.isRendering = true;

    try {
      if (!this.currentChatFile) return;

      let fileContent: string;
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView && activeView.file?.path === this.currentChatFile.path) {
        fileContent = activeView.editor.getValue();
      } else {
        fileContent = await this.app.vault.read(this.currentChatFile);
      }

      const editorService = this.serviceLocator.getEditorService();
      const settings = this.serviceLocator.getSettingsService().getSettings();
      const { messagesWithRole } = await editorService.getMessagesFromFileContent(fileContent, settings);

      const newMessagesCache = JSON.stringify(messagesWithRole);

      if (newMessagesCache === this.currentMessagesCache) {
        this.isRendering = false;
        return;
      }

      this.currentMessagesCache = newMessagesCache;
      this.messageContainer.empty();

      for (const [index, message] of messagesWithRole.entries()) {
        if (message.content.trim() === "") continue;
        this.addMessageToView(message, index);
      }
    } catch (error) {
      console.error("Error rendering conversation in side view:", error);
    } finally {
      this.isRendering = false;
      this.scrollToBottom();
    }
  }

  addMessageToView(message: Message, index: number): HTMLElement {
    const messageEl = this.messageContainer.createDiv({
      cls: `chat-message ${message.role}`,
    });
    messageEl.dataset.messageIndex = String(index);

    const messageActions = messageEl.createDiv({ cls: "chat-message-actions" });

    const editButton = messageActions.createEl("button", { cls: "chat-message-action-button" });
    setIcon(editButton, "pencil");
    editButton.setAttribute("aria-label", "Edit message");
    editButton.addEventListener("click", () => this.handleEdit(message, index));

    const deleteButton = messageActions.createEl("button", { cls: "chat-message-action-button" });
    setIcon(deleteButton, "trash-2");
    deleteButton.setAttribute("aria-label", "Delete message");
    deleteButton.addEventListener("click", () => this.handleDelete(messageEl, index));

    const copyButton = messageActions.createEl("button", { cls: "chat-message-action-button" });
    setIcon(copyButton, "copy");
    copyButton.setAttribute("aria-label", "Copy message");
    copyButton.addEventListener("click", () => {
      navigator.clipboard
        .writeText(message.content)
        .then(() => new Notice("Copied to clipboard"))
        .catch((err) => new Notice("Failed to copy message to clipboard"));
    });

    const contentEl = messageEl.createDiv({ cls: "chat-message-content" });
    MarkdownRenderer.render(this.app, message.content, contentEl, this.currentChatFile?.path || "", this);
    this.scrollToBottom();
    return messageEl;
  }

  private handleEdit(message: Message, index: number) {
    // Hide main view
    this.messageContainer.style.display = "none";
    this.inputForm.style.display = "none";
    this.headerEl.style.display = "none";
    this.paramsEl.style.display = "none";

    // Show editor
    this.editorContainer.style.display = "flex";
    this.editorContainer.empty();

    const textArea = this.editorContainer.createEl("textarea", { text: message.content });
    textArea.focus();

    const buttonContainer = this.editorContainer.createDiv({ cls: "chat-edit-actions" });
    const saveButton = buttonContainer.createEl("button", { text: "Save", cls: "mod-cta" });
    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });

    const restoreMainView = () => {
      // Hide editor
      this.editorContainer.style.display = "none";
      this.editorContainer.empty();

      // Show main view
      this.messageContainer.style.display = "flex";
      this.inputForm.style.display = "flex";
      this.headerEl.style.display = "flex";
    };

    saveButton.onclick = async () => {
      const newContent = textArea.value;
      if (this.currentChatFile) {
        try {
          await this.chatService.updateMessage(this.currentChatFile, index, newContent);
          new Notice("Message updated.");
          restoreMainView();
          this.scheduleUpdate();
        } catch (error) {
          new Notice("Failed to update message.");
          console.error(error);
          restoreMainView();
        }
      }
    };
    cancelButton.onclick = restoreMainView;
  }

  private async handleDelete(messageEl: HTMLElement, index: number) {
    const confirmed = await this.confirmAction(
      "Delete Message",
      "Are you sure you want to delete this message? This action cannot be undone.",
      "Delete"
    );
    if (confirmed && this.currentChatFile) {
      try {
        await this.chatService.deleteMessage(this.currentChatFile, index);
        messageEl.remove();
        new Notice("Message deleted.");
        this.scheduleUpdate();
      } catch (error) {
        new Notice("Failed to delete message.");
        console.error(error);
      }
    }
  }

  private async handleClearChat() {
    if (!this.currentChatFile) return;

    const confirmed = await this.confirmAction(
      "Clear Chat History",
      "Are you sure you want to clear all messages in this chat? This action cannot be undone.",
      "Clear"
    );
    if (confirmed) {
      try {
        await this.chatService.clearChatHistory(this.currentChatFile);
        new Notice("Chat cleared.");
        this.scheduleUpdate();
      } catch (error) {
        new Notice("Failed to clear chat.");
        console.error(error);
      }
    }
  }

  private confirmAction(title: string, message: string, cta: string): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new Modal(this.app);
      modal.titleEl.setText(title);
      modal.contentEl.setText(message);
      new Setting(modal.contentEl)
        .addButton((btn) =>
          btn
            .setButtonText(cta)
            .setWarning()
            .onClick(() => {
              modal.close();
              resolve(true);
            })
        )
        .addButton((btn) =>
          btn.setButtonText("Cancel").onClick(() => {
            modal.close();
            resolve(false);
          })
        );
      modal.open();
    });
  }

  private startNewAssistantMessage() {
    this.currentAssistantMessageContent = "";
    this.currentAssistantMessageEl = this.addMessageToView({ role: "assistant", content: "▋" }, -1); // Use temp index
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
      }
    }
    this.currentAssistantMessageEl = null;
    this.currentAssistantMessageContent = "";
    this.scrollToBottom();
  }

  private async handleSendMessage() {
    const message = this.textInput.value.trim();
    if (!message || this.isAwaitingResponse || !this.currentChatFile) return;

    this.textInput.value = "";
    this.setButtonState("generating");

    this.addMessageToView({ role: "user", content: message }, -1); // Temp index
    this.startNewAssistantMessage();

    try {
      await this.chatService.sendMessageFromSidebar(message, this.currentChatFile, {
        onChunk: (chunk: string) => this.appendChunkToView(chunk),
        onDone: (fullText: string) => this.finalizeAssistantMessage(fullText),
      });
    } catch (err) {
      console.error("[ChatGPT MD] Error sending message from sidebar:", err);
      this.finalizeAssistantMessage("An error occurred. Please check the console for details.");
    } finally {
      this.setButtonState("idle");
      this.textInput.focus();
      this.scheduleUpdate();
    }
  }

  private scrollToBottom() {
    this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
  }
}
