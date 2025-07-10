import { DEFAULT_OPENAI_CONFIG } from "src/Services/OpenAiService";
import {
  DEFAULT_CHAT_FRONT_MATTER,
  DEFAULT_DATE_FORMAT,
  DEFAULT_HEADING_LEVEL,
  DEFAULT_INFER_TITLE_LANGUAGE,
} from "../Constants";
import { DEFAULT_OPENROUTER_CONFIG } from "src/Services/OpenRouterService";
import { DEFAULT_OLLAMA_CONFIG } from "src/Services/OllamaService";
import { DEFAULT_LMSTUDIO_CONFIG } from "src/Services/LmStudioService";
import { DEFAULT_ANTHROPIC_CONFIG } from "src/Services/AnthropicService";

/**
 * API key settings
 */
export interface ApiKeySettings {
  /** API Key for OpenAI */
  apiKey: string;
  /** API Key for OpenRouter */
  openrouterApiKey: string;
  /** API Key for Anthropic */
  anthropicApiKey: string;
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
  /** Whether to generate text at cursor instead of end of file */
  generateAtCursor: boolean;
  /** Whether to automatically infer title after 4 messages have been exchanged */
  autoInferTitle: boolean;
  /** Whether to disable the plugin's system message */
  disablePluginSystemMessage: boolean;
  /** Command to run after generation is complete (Desktop only) */
  postGenerationCommand: string;
}

/**
 * Formatting settings
 */
export interface FormattingSettings {
  /** Date format for chat files */
  dateFormat: string;
  /** Heading level for messages */
  headingLevel: number;
  /** Language to use for title inference */
  inferTitleLanguage: string;
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
  /** URL for OpenRouter API */
  openrouterUrl: string;
  /** URL for Ollama API */
  ollamaUrl: string;
  /** URL for LM Studio API */
  lmstudioUrl: string;
  /** URL for Anthropic API */
  anthropicUrl: string;
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
  openrouterApiKey: "",
  anthropicApiKey: "",

  // Service URLs
  openaiUrl: DEFAULT_OPENAI_CONFIG.url,
  openrouterUrl: DEFAULT_OPENROUTER_CONFIG.url,
  ollamaUrl: DEFAULT_OLLAMA_CONFIG.url,
  lmstudioUrl: DEFAULT_LMSTUDIO_CONFIG.url,
  anthropicUrl: DEFAULT_ANTHROPIC_CONFIG.url,

  // Folders
  chatFolder: "ChatGPT_MD/chats",
  chatTemplateFolder: "ChatGPT_MD/templates",

  // Chat Behavior
  stream: true,
  generateAtCursor: false,
  autoInferTitle: false,
  disablePluginSystemMessage: false,
  postGenerationCommand: "",

  // Formatting
  dateFormat: DEFAULT_DATE_FORMAT,
  headingLevel: DEFAULT_HEADING_LEVEL,
  inferTitleLanguage: DEFAULT_INFER_TITLE_LANGUAGE,

  // Templates
  defaultChatFrontmatter: DEFAULT_CHAT_FRONT_MATTER,
};
