import { App, Plugin } from "obsidian";
import { FileService } from "src/Services/FileService";
import { EditorContentService } from "src/Services/EditorContentService";
import { MessageService } from "src/Services/MessageService";
import { TemplateService } from "src/Services/TemplateService";
import { FrontmatterService } from "src/Services/FrontmatterService";
import { FrontmatterManager } from "src/Services/FrontmatterManager";
import { EditorService } from "src/Services/EditorService";
import { NotificationService } from "src/Services/NotificationService";
import { ErrorService } from "src/Services/ErrorService";
import { ApiService } from "src/Services/ApiService";
import { ApiAuthService } from "src/Services/ApiAuthService";
import { ApiResponseParser } from "src/Services/ApiResponseParser";
import { IAiApiService } from "src/Services/AiService";
import { OpenAiService } from "src/Services/OpenAiService";
import { AI_SERVICE_OPENAI } from "src/Constants";
import { SettingsService } from "src/Services/SettingsService";
import { ChatService } from "src/Services/ChatService";
import { CommandRegistry } from "./CommandRegistry";

/**
 * ServiceLocator is responsible for creating and providing access to services
 * It centralizes service creation and dependency injection
 */
export class ServiceLocator {
  private readonly app: App;
  private readonly plugin: Plugin;

  private fileService: FileService;
  private editorContentService: EditorContentService;
  private messageService: MessageService;
  private templateService: TemplateService;
  private frontmatterManager: FrontmatterManager;
  private frontmatterService: FrontmatterService;
  private editorService: EditorService;
  private notificationService: NotificationService;
  private errorService: ErrorService;
  private apiService: ApiService;
  private apiAuthService: ApiAuthService;
  private apiResponseParser: ApiResponseParser;
  private settingsService: SettingsService;
  private chatService: ChatService;

  // These are not services in the same way, but are needed by services
  private statusBarItem: HTMLElement;
  private commandRegistry: CommandRegistry;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.statusBarItem = plugin.addStatusBarItem();
    this.initializeServices();
  }

  /**
   * Initialize all services
   */
  private initializeServices(): void {
    // Initialize basic services
    this.notificationService = new NotificationService();
    this.errorService = new ErrorService(this.notificationService);

    // Initialize API services
    this.apiService = new ApiService(this.errorService, this.notificationService);
    this.apiAuthService = new ApiAuthService(this.notificationService);
    this.apiResponseParser = new ApiResponseParser(this.notificationService);

    // Initialize specialized services
    this.fileService = new FileService(this.app);
    this.frontmatterManager = new FrontmatterManager(this.app);
    this.editorContentService = new EditorContentService(this.app);
    this.messageService = new MessageService(this.fileService, this.notificationService);
    this.frontmatterService = new FrontmatterService(this.app, this.frontmatterManager);
    this.templateService = new TemplateService(this.app, this.fileService, this.editorContentService);

    // Initialize the EditorService with all specialized services
    this.editorService = new EditorService(
      this.app,
      this.fileService,
      this.editorContentService,
      this.messageService,
      this.templateService,
      this.frontmatterService
    );

    // Initialize settings service
    this.settingsService = new SettingsService(this.plugin, this.notificationService, this.errorService);

    // Initialize chat service
    this.chatService = new ChatService(this, this.settingsService);
  }

  setCommandRegistry(registry: CommandRegistry) {
    this.commandRegistry = registry;
  }

  /**
   * Get an AI API service based on the service type
   */
  getAiApiService(serviceType: string): IAiApiService {
    // Only OpenAI is supported now, so we can simplify this.
    return new OpenAiService(this.errorService, this.notificationService);
  }

  // Getters for all services
  getApp(): App {
    return this.app;
  }

  getFileService(): FileService {
    return this.fileService;
  }

  getEditorContentService(): EditorContentService {
    return this.editorContentService;
  }

  getMessageService(): MessageService {
    return this.messageService;
  }

  getTemplateService(): TemplateService {
    return this.templateService;
  }

  getFrontmatterManager(): FrontmatterManager {
    return this.frontmatterManager;
  }

  getFrontmatterService(): FrontmatterService {
    return this.frontmatterService;
  }

  getEditorService(): EditorService {
    return this.editorService;
  }

  getNotificationService(): NotificationService {
    return this.notificationService;
  }

  getErrorService(): ErrorService {
    return this.errorService;
  }

  getApiService(): ApiService {
    return this.apiService;
  }

  getApiAuthService(): ApiAuthService {
    return this.apiAuthService;
  }

  getApiResponseParser(): ApiResponseParser {
    return this.apiResponseParser;
  }

  getChatService(): ChatService {
    return this.chatService;
  }

  getCommandRegistry(): CommandRegistry {
    return this.commandRegistry;
  }

  /**
   * Get the settings service
   */
  getSettingsService(): SettingsService {
    return this.settingsService;
  }

  getStatusBarItem(): HTMLElement {
    return this.statusBarItem;
  }
}
