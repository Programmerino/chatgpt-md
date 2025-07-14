export const AI_SERVICE_OPENAI = "openai";
export const DEBUG_MODEL_ID = "DEBUG";

// API endpoints for each service
export const API_ENDPOINTS = {
  [AI_SERVICE_OPENAI]: "/v1/chat/completions",
};

export const CALL_CHATGPT_API_COMMAND_ID = "call-chatgpt-api";
export const STOP_GENERATING_COMMAND_ID = "stop-generating";
export const CHOOSE_CHAT_TEMPLATE_COMMAND_ID = "choose-chat-template";
export const CLEAR_CHAT_COMMAND_ID = "clear-chat";
export const DEBUG_REQUEST_COMMAND_ID = "debug-create-request-note";
export const TOGGLE_CHAT_SIDEBAR_COMMAND_ID = "toggle-chat-sidebar";
export const IMPORT_FROM_AI_STUDIO_COMMAND_ID = "import-from-ai-studio";

export const CHAT_ERROR_MESSAGE_401 =
  "I am sorry. There was an authorization issue with the external API (Status 401).\nPlease check your API key in the settings";
export const CHAT_ERROR_MESSAGE_NO_CONNECTION =
  "I am sorry. There was an issue reaching the network.\nPlease check your network connection.";
export const CHAT_ERROR_MESSAGE_404 =
  "I am sorry, your request looks wrong. Please check your URL or model name in the settings or frontmatter.";
export const CHAT_ERROR_RESPONSE =
  "I am sorry, I could not answer your request because of an error, here is what went wrong:";

export const CHAT_FOLDER_TYPE = "chatFolder";
export const CHAT_TEMPLATE_FOLDER_TYPE = "chatTemplateFolder";

export const NEWLINE = "\n\n";

export const DEFAULT_HEADING_LEVEL = 3;
export const MAX_HEADING_LEVEL = 6;
export const DEFAULT_DATE_FORMAT = "YYYYMMDDhhmmss";

export const ERROR_NO_CONNECTION = "Failed to fetch";

export const HORIZONTAL_LINE_CLASS = "__chatgpt_plugin";
export const HORIZONTAL_LINE_MD = `<hr class="${HORIZONTAL_LINE_CLASS}">`;

export const ROLE_IDENTIFIER = "role::";
export const ROLE_ASSISTANT = "assistant";
export const ROLE_DEVELOPER = "system";
export const ROLE_SYSTEM = "system";
export const ROLE_USER = "user";

export const DEFAULT_CHAT_FRONT_MATTER = `---
system_commands: ['I am a helpful assistant.']
model: gpt-4o-mini
stream: true
---`;

export const FETCH_MODELS_TIMEOUT_MS = 6000;
