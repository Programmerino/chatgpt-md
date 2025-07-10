import { App, Modal, Setting } from "obsidian";

/**
 * A modal that prompts the user to enter a mock response for debugging/testing.
 */
export class MockResponseModal extends Modal {
  private response: string = "";
  private onSubmit: (response: string) => void;
  private promptTitle: string;
  private promptDescription: string;

  constructor(app: App, title: string, description: string, onSubmit: (response: string) => void) {
    super(app);
    this.promptTitle = title;
    this.promptDescription = description;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.promptTitle });

    let textArea: HTMLTextAreaElement;

    new Setting(contentEl)
      .setName("Mock Response")
      .setDesc(this.promptDescription)
      .addTextArea((text) => {
        textArea = text.inputEl;
        text.inputEl.rows = 10;
        text.inputEl.style.width = "100%";
        text.setPlaceholder("Type your mock response here...");
        text.inputEl.focus(); // Automatically focus the textarea
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Submit")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(textArea.value);
        })
    );

    // Allow submitting with Ctrl+Enter
    contentEl.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
        this.close();
        this.onSubmit(textArea.value);
      }
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
