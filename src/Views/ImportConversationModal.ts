import { App, Modal, Setting, Notice, stringifyYaml } from "obsidian";
import { SettingsService } from "src/Services/SettingsService";
import { FileService } from "src/Services/FileService";
import { MessageService } from "src/Services/MessageService";
import { Message } from "src/Models/Message";
import { getHeadingPrefix } from "src/Utilities/TextHelpers";
import { HORIZONTAL_LINE_MD, NEWLINE, ROLE_ASSISTANT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";

interface AiStudioChunk {
  text: string;
  role: "user" | "model";
  isThought?: boolean;
}

interface AiStudioJson {
  runSettings?: {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
  };
  systemInstruction?: {
    text: string;
  };
  chunkedPrompt?: {
    chunks: AiStudioChunk[];
  };
}

export class ImportConversationModal extends Modal {
  private jsonInput: string = "";

  constructor(
    app: App,
    private settingsService: SettingsService,
    private fileService: FileService,
    private messageService: MessageService
  ) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Import from Google AI Studio" });

    new Setting(contentEl)
      .setName("AI Studio JSON")
      .setDesc("Paste the entire JSON content from an AI Studio conversation export.")
      .addTextArea((text) => {
        text.inputEl.rows = 15;
        text.inputEl.style.width = "100%";
        text.setPlaceholder("Paste JSON here...");
        text.onChange((value) => {
          this.jsonInput = value;
        });
        text.inputEl.focus();
      });

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Import Conversation")
        .setCta()
        .onClick(() => {
          this.handleImport();
        })
    );
  }

  private async handleImport() {
    if (!this.jsonInput.trim()) {
      new Notice("JSON input cannot be empty.");
      return;
    }

    try {
      const data: AiStudioJson = JSON.parse(this.jsonInput);

      // --- 1. Parse Frontmatter ---
      const frontmatter: Record<string, any> = {};
      if (data.runSettings) {
        if (data.runSettings.model) {
          frontmatter.model = data.runSettings.model.replace(/^models\//, "");
        }
        if (data.runSettings.temperature !== undefined) {
          frontmatter.temperature = data.runSettings.temperature;
        }
        if (data.runSettings.topP !== undefined) {
          frontmatter.top_p = data.runSettings.topP;
        }
        if (data.runSettings.topK !== undefined) {
          frontmatter.top_k = data.runSettings.topK;
        }
        if (data.runSettings.maxOutputTokens !== undefined) {
          frontmatter.max_tokens = data.runSettings.maxOutputTokens;
        }
      }
      if (data.systemInstruction?.text) {
        frontmatter.system_commands = [data.systemInstruction.text];
      }
      frontmatter.stream = true; // Default to stream enabled

      // --- 2. Parse Messages ---
      const messages: Message[] = (data.chunkedPrompt?.chunks ?? [])
        .filter((chunk) => !chunk.isThought && chunk.text.trim() !== "")
        .map((chunk) => ({
          role: chunk.role === "model" ? ROLE_ASSISTANT : ROLE_USER,
          content: chunk.text,
        }));

      if (messages.length === 0) {
        new Notice("No valid messages found in the JSON data.");
        return;
      }

      // --- 3. Construct Markdown Content ---
      const settings = this.settingsService.getSettings();
      const headingPrefix = getHeadingPrefix(settings.headingLevel);
      let markdownContent = `---\n${stringifyYaml(frontmatter)}---\n\n`;

      const messageBlocks = messages.map((msg) => {
        const modelSpan =
          msg.role === ROLE_ASSISTANT && frontmatter.model
            ? `<span style="font-size: small;"> (${frontmatter.model as string})</span>`
            : "";
        const header = `${headingPrefix}${ROLE_IDENTIFIER}${msg.role}${modelSpan}${NEWLINE}`;
        return `${header}${msg.content.trim()}`;
      });

      markdownContent += messageBlocks.join(`\n\n${HORIZONTAL_LINE_MD}\n\n`);

      // Add a final empty user block for usability, separated by an <hr>
      markdownContent += `\n\n${this.messageService.getHeaderRole(headingPrefix, ROLE_USER)}`;

      // --- 4. Create and Open File ---
      const chatFolder = settings.chatFolder;
      await this.fileService.ensureFolderExists(chatFolder, "chat");

      const timestamp = this.fileService.formatDate(new Date(), settings.dateFormat);
      const newFileName = `Imported from AI Studio - ${timestamp}.md`;
      const newFilePath = `${chatFolder}/${newFileName}`;

      const newFile = await this.fileService.createNewFile(newFilePath, markdownContent);
      await this.app.workspace.openLinkText(newFile.path, "", true);

      new Notice("Successfully imported conversation.");
      this.close();
    } catch (error) {
      console.error("[ChatGPT MD] Error importing from AI Studio:", error);
      new Notice(`Failed to import conversation. Invalid JSON or unexpected format. Check console for details.`);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
