import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { ChatGPT_MDSettings } from "src/Models/Config";
import { DEFAULT_CHAT_FRONT_MATTER, DEFAULT_DATE_FORMAT, ROLE_IDENTIFIER, ROLE_USER } from "src/Constants";
import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";

interface SettingDefinition {
  id: keyof ChatGPT_MDSettings;
  name: string;
  description: string;
  type: "text" | "textarea" | "toggle";
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
        name: "OpenAI API key",
        description: "Your API key for OpenAI.",
        type: "text",
        placeholder: "your-openai-api-key",
        group: "API Keys",
      },
      {
        id: "openaiUrl",
        name: "OpenAI API URL",
        description: `The URL for the OpenAI API. Default is ${DEFAULT_OPENAI_CONFIG.url}.`,
        type: "text",
        placeholder: DEFAULT_OPENAI_CONFIG.url,
        group: "Service URLs",
      },
      {
        id: "defaultChatFrontmatter",
        name: "Default chat frontmatter",
        description:
          "Default frontmatter for new chat files. This is prepended to chat templates that do not contain their own frontmatter.",
        type: "textarea",
        placeholder: DEFAULT_CHAT_FRONT_MATTER,
        group: "Chat Behavior",
      },
      {
        id: "stream",
        name: "Stream responses",
        description: "Stream responses from the AI in real-time.",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "enterToSend",
        name: "Send on enter",
        description:
          "If enabled, pressing Enter sends the message. Pressing Shift+Enter creates a new line. If disabled, the behavior is reversed.",
        type: "toggle",
        group: "Chat Behavior",
      },
      {
        id: "chatFolder",
        name: "Chat folder",
        description: "Path to the folder for storing chat files.",
        type: "text",
        group: "Folders",
      },
      {
        id: "chatTemplateFolder",
        name: "Chat template folder",
        description: "Path to the folder for storing chat file templates.",
        type: "text",
        placeholder: "chat-templates",
        group: "Folders",
      },
      {
        id: "dateFormat",
        name: "Date format",
        description: "Moment.js format for chat file names. Valid date blocks are: YYYY, MM, DD, hh, mm, ss.",
        type: "text",
        placeholder: DEFAULT_DATE_FORMAT,
        group: "Formatting",
      },
      {
        id: "headingLevel",
        name: "Heading level",
        description: `Heading level for messages (e.g., '## ${ROLE_IDENTIFIER}${ROLE_USER}'). Valid levels are 0 to 6.`,
        type: "text",
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
      new Setting(containerEl).setHeading().setName(group);
      settings.forEach((setting) => {
        this.createSettingElement(containerEl, setting);
      });
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
            (this.settingsProvider.settings[schema.id] as string | number) =
              schema.id === "headingLevel" ? parseInt(value, 10) : value;
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
    }
  }
}
