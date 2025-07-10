import { App, MarkdownView, Notice, SuggestModal } from "obsidian";
import { EditorService } from "../Services/EditorService";

export class AiModelSuggestModal extends SuggestModal<string> {
  private modelNames: string[];
  private readonly initialModels: string[];
  private view: MarkdownView;
  private editorService: EditorService;
  private modelFetchPromise: Promise<string[]>;
  private isLoading: boolean = true;

  constructor(app: App, view: MarkdownView, editorService: EditorService, modelsPromise: Promise<string[]>) {
    super(app);
    this.view = view;
    this.editorService = editorService;
    this.modelNames = [];
    this.modelFetchPromise = modelsPromise;
    this.setPlaceholder("Loading available models...");
  }

  async onOpen() {
    super.onOpen();
    try {
      const freshModels = await this.modelFetchPromise;
      this.modelNames = freshModels;
      this.isLoading = false;
      if (this.modelNames.length > 0) {
        this.setPlaceholder("Select a Large Language Model");
      } else {
        this.setPlaceholder("No models found. Check API key and settings.");
      }
      // Since the suggestions are now available, we need to re-evaluate them
      // against the current input by dispatching an input event.
      if (this.inputEl) {
        this.inputEl.dispatchEvent(new Event("input"));
      }
    } catch (e) {
      this.setPlaceholder("Error fetching models. Check console.");
      console.error("[ChatGPT MD] Error fetching models for modal:", e);
    }
  }

  getSuggestions(query: string): string[] {
    if (this.isLoading) {
      return [];
    }
    return this.modelNames.filter((model) => model.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(model: string, el: HTMLElement) {
    el.createEl("div", { text: model });
  }

  onNoSuggestion() {
    if (this.isLoading) {
      this.resultContainerEl.empty();
      this.resultContainerEl.createEl("div", {
        text: "Loading models...",
        cls: "suggestion-empty",
      });
    } else {
      super.onNoSuggestion();
    }
  }

  async onChooseSuggestion(modelName: string, evt: MouseEvent | KeyboardEvent) {
    if (this.isLoading || this.modelNames.indexOf(modelName) === -1) {
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
