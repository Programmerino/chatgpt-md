import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import { DEFAULT_CHAT_FRONT_MATTER, DEFAULT_DATE_FORMAT, DEFAULT_HEADING_LEVEL } from "../Constants";

/**
 * API key settings
 */
export interface ApiKeySettings {
  /** API Key for OpenAI */
  apiKey: string;
}

/**
 * Folder settings
 */
export interface FolderSettings {
  /** Path to folder for chat files */
  chatFolder: string;
  /** Path to folder for chat file templates */
  chatTemplateFolder: string;
}

/**
 * Chat behavior settings
 */
export interface ChatBehaviorSettings {
  /** Whether to stream responses from the AI */
  stream: boolean;
  /** Whether to disable the plugin's system message */
  disablePluginSystemMessage: boolean;
  /** Whether Enter key sends message, or Shift+Enter */
  enterToSend: boolean;
}

/**
 * Formatting settings
 */
export interface FormattingSettings {
  /** Date format for chat files */
  dateFormat: string;
  /** Heading level for messages */
  headingLevel: number;
}

/**
 * Chat template settings
 */
export interface TemplateSettings {
  /** Default frontmatter for new chat files */
  defaultChatFrontmatter: string;
  /** System commands to include in the chat */
  system_commands?: string[] | null;
}

/**
 * Service URL settings
 */
export interface ServiceUrlSettings {
  /** URL for OpenAI API */
  openaiUrl: string;
}

/**
 * Combined settings interface
 */
export interface ChatGPT_MDSettings
  extends ApiKeySettings,
    FolderSettings,
    ChatBehaviorSettings,
    FormattingSettings,
    TemplateSettings,
    ServiceUrlSettings {}

/**
 * Default settings
 */
export const DEFAULT_SETTINGS: ChatGPT_MDSettings = {
  // API Keys
  apiKey: "",

  // Service URLs
  openaiUrl: DEFAULT_OPENAI_CONFIG.url,

  // Folders
  chatFolder: "ChatGPT_MD/chats",
  chatTemplateFolder: "ChatGPT_MD/templates",

  // Chat Behavior
  stream: true,
  disablePluginSystemMessage: false,
  enterToSend: true,

  // Formatting
  dateFormat: DEFAULT_DATE_FORMAT,
  headingLevel: DEFAULT_HEADING_LEVEL,

  // Templates
  defaultChatFrontmatter: DEFAULT_CHAT_FRONT_MATTER,
};
