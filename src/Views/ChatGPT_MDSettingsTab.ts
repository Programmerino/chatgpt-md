import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_CHAT_FRONT_MATTER, DEFAULT_DATE_FORMAT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";

interface SettingDefinition {
  id: keyof ChatGPT_MDSettings;
  name: string;
  description: string;
  type: "text" | "textarea" | "toggle" | "dropdown";
  placeholder?: string;
  options?: Record<string, string>;
  group: string;
}

interface SettingsProvider {
  settings: ChatGPT_MDSettings;
  saveSettings: () => Promise<void>;
}

export class ChatGPT_MDSettingsTab extends PluginSettingTab {
  settingsProvider: SettingsProvider;

  constructor(app: App, plugin: Plugin, settingsProvider: SettingsProvider) {
    super(app, plugin);
    this.settingsProvider = settingsProvider;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const settingsSchema: SettingDefinition[] = [
      {
        id: "apiKey",
        name: "OpenAI API Key",
        description: "API Key for OpenAI",
        type: "text",
        placeholder: "your openAI API Key",
        group: "API Keys",
      },
      {
        id: "openaiUrl",
        name: "OpenAI API URL",
        description: `URL for OpenAI API\nDefault URL: ${DEFAULT_OPENAI_CONFIG.url}`,
        type: "text",
        placeholder: DEFAULT_OPENAI_CONFIG.url,
        group: "Service URLs",
      },
      {
        id: "defaultChatFrontmatter",
        name: "Default Chat Frontmatter",
        description:
          "Default frontmatter for new chat files. You can use all of the settings exposed by the OpenAI API here: https://platform.openai.com/docs/api-reference/chat/create",
        type: "textarea",
        placeholder: DEFAULT_CHAT_FRONT_MATTER,
        group: "Chat Behavior",
      },
      {
        id: "stream",
        name: "Stream",
        description: "Stream responses from the AI",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "generateAtCursor",
        name: "Generate at Cursor",
        description: "Generate text at cursor instead of end of file",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "autoInferTitle",
        name: "Automatically Infer Title",
        description: "Automatically infer title after 4 messages have been exchanged",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "disablePluginSystemMessage",
        name: "Disable Plugin System Message",
        description: "If enabled, the plugin's system message will not be added to your prompts.",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "chatFolder",
        name: "Chat Folder",
        description: "Path to folder for chat files",
        type: "text",
        group: "Folders",
      },
      {
        id: "chatTemplateFolder",
        name: "Chat Template Folder",
        description: "Path to folder for chat file templates",
        type: "text",
        placeholder: "chat-templates",
        group: "Folders",
      },
      {
        id: "dateFormat",
        name: "Date Format",
        description: "Date format for chat files. Valid date blocks are: YYYY, MM, DD, hh, mm, ss",
        type: "text",
        placeholder: DEFAULT_DATE_FORMAT,
        group: "Formatting",
      },
      {
        id: "headingLevel",
        name: "Heading Level",
        description: `Heading level for messages (example for heading level 2: '## ${ROLE_IDENTIFIER}${ROLE_USER}'). Valid heading levels are from 0 to 6.`,
        type: "text",
        group: "Formatting",
      },
      {
        id: "inferTitleLanguage",
        name: "Infer title language",
        description: "Language to use for title inference.",
        type: "dropdown",
        options: {
          English: "English",
          Japanese: "Japanese",
          Spanish: "Spanish",
          French: "French",
          German: "German",
          Chinese: "Chinese",
          Korean: "Korean",
          Italian: "Italian",
          Russian: "Russian",
        },
        group: "Formatting",
      },
    ];

    const groupedSettings: Record<string, SettingDefinition[]> = {};
    settingsSchema.forEach((setting) => {
      if (!groupedSettings[setting.group]) {
        groupedSettings[setting.group] = [];
      }
      groupedSettings[setting.group].push(setting);
    });

    Object.entries(groupedSettings).forEach(([group, settings]) => {
      containerEl.createEl("h3", { text: group });
      settings.forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });
      containerEl.createEl("hr");
    });
  }

  createSettingElement(container: HTMLElement, schema: SettingDefinition) {
    const setting = new Setting(container).setName(schema.name).setDesc(schema.description);

    if (schema.type === "text") {
      setting.addText((text) => {
        text
          .setPlaceholder(schema.placeholder || "")
          .setValue(String(this.settingsProvider.settings[schema.id]))
          .onChange(async (value) => {
            (this.settingsProvider.settings[schema.id] as string) = value;
            await this.settingsProvider.saveSettings();
          });
        text.inputEl.style.width = "300px";
      });
    } else if (schema.type === "textarea") {
      setting.addTextArea((text) => {
        text
          .setPlaceholder(schema.placeholder || "")
          .setValue(String(this.settingsProvider.settings[schema.id] || schema.placeholder))
          .onChange(async (value) => {
            (this.settingsProvider.settings[schema.id] as string) = value;
            await this.settingsProvider.saveSettings();
          });
        text.inputEl.style.width = "300px";
        if (schema.id === "defaultChatFrontmatter") {
          text.inputEl.style.height = "260px";
          text.inputEl.style.minHeight = "260px";
        }
      });
    } else if (schema.type === "toggle") {
      setting.addToggle((toggle) =>
        toggle.setValue(Boolean(this.settingsProvider.settings[schema.id])).onChange(async (value) => {
          (this.settingsProvider.settings[schema.id] as boolean) = value;
          await this.settingsProvider.saveSettings();
        })
      );
    } else if (schema.type === "dropdown" && schema.options) {
      setting.addDropdown((dropdown) => {
        dropdown.addOptions(schema.options || {});
        dropdown.setValue(String(this.settingsProvider.settings[schema.id]));
        dropdown.onChange(async (value) => {
          (this.settingsProvider.settings[schema.id] as string) = value;
          await this.settingsProvider.saveSettings();
        });
        dropdown.selectEl.style.width = "300px";
      });
    }
  }
}
