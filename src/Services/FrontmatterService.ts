import { App, Editor, MarkdownView, TFile } from "obsidian";
import { parseSettingsFrontmatter } from "src/Utilities/TextHelpers";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import { AI_SERVICE_OPENAI } from "src/Constants";
import { FrontmatterManager } from "src/Services/FrontmatterManager";

export class FrontmatterService {
  constructor(
    private app: App,
    private frontmatterManager: FrontmatterManager
  ) {}

  async getFrontmatter(file: TFile | null, settings: ChatGPT_MDSettings): Promise<any> {
    let frontmatter: Record<string, any> = {};

    if (file) {
      const fileFrontmatter = await this.frontmatterManager.readFrontmatter(file);
      if (fileFrontmatter) {
        frontmatter = { ...fileFrontmatter };
      }
    }

    const defaultFrontmatter = settings.defaultChatFrontmatter
      ? parseSettingsFrontmatter(settings.defaultChatFrontmatter)
      : {};

    const mergedConfig: Record<string, any> = {
      ...settings,
      ...defaultFrontmatter,
      ...frontmatter,
    };

    // Simplify service determination - it's always OpenAI now
    mergedConfig.aiService = AI_SERVICE_OPENAI;
    mergedConfig.url = mergedConfig.openaiUrl || settings.openaiUrl || DEFAULT_OPENAI_CONFIG.url;

    return mergedConfig;
  }

  async updateFrontmatterField(file: TFile, key: string, value: any): Promise<void> {
    try {
      await this.frontmatterManager.updateFrontmatterField(file, key, value);
    } catch (error) {
      console.error("[ChatGPT MD] Error updating frontmatter:", error);
      throw error;
    }
  }
}
