import { App, Editor, MarkdownView, Notice, SuggestModal } from "obsidian";
import { EditorService } from "../Services/EditorService";

export class AiModelSuggestModal extends SuggestModal<string> {
  private modelNames: string[];
  private view: MarkdownView;
  private editorService: EditorService;

  constructor(app: App, view: MarkdownView, editorService: EditorService, modelNames: string[] = []) {
    super(app);
    this.modelNames = modelNames;
    this.view = view;
    this.editorService = editorService;
    this.limit = this.modelNames.length;
    if (this.modelNames.length > 0) {
      this.setPlaceholder("Select Large Language Model");
    } else {
      this.setPlaceholder("Loading available models...");
    }
  }

  getSuggestions(query: string): string[] {
    return this.modelNames.filter((model) => model.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(model: string, el: HTMLElement) {
    el.createEl("div", { text: model });
  }

  async onChooseSuggestion(modelName: string, evt: MouseEvent | KeyboardEvent) {
    if (this.modelNames.indexOf(modelName) === -1 || this.modelNames.length === 0) {
      return;
    }

    new Notice(`Selected model: ${modelName}`);
    try {
      await this.editorService.setModel(this.view, modelName);
    } catch (error) {
      console.error("[ChatGPT MD] Error setting model in frontmatter:", error);
      new Notice(`Error setting model: ${error.message}`);
    }
  }
}
