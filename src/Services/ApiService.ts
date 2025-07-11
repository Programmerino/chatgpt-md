import { App, Platform, requestUrl } from "obsidian";
import { ApiAuthService } from "./ApiAuthService";
import { ApiResponseParser } from "./ApiResponseParser";
import { ErrorService } from "./ErrorService";
import { NotificationService } from "./NotificationService";

/**
 * ApiService handles all API communication for the application
 * It centralizes request logic, error handling, and response processing
 */
export class ApiService {
  private abortController: AbortController | null = null;
  private errorService: ErrorService;
  private notificationService: NotificationService;
  private apiAuthService: ApiAuthService;
  private apiResponseParser: ApiResponseParser;

  constructor(
    public readonly app: App,
    errorService?: ErrorService,
    notificationService?: NotificationService,
    apiAuthService?: ApiAuthService,
    apiResponseParser?: ApiResponseParser
  ) {
    this.notificationService = notificationService || new NotificationService();
    this.errorService = errorService || new ErrorService(this.notificationService);
    this.apiAuthService = apiAuthService || new ApiAuthService();
    this.apiResponseParser = apiResponseParser || new ApiResponseParser();
  }

  /**
   * Make a streaming API request
   * @param url The API endpoint URL
   * @param payload The request payload
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns A Response object for streaming
   */
  async makeStreamingRequest(
    url: string,
    payload: any,
    headers: Record<string, string>,
    serviceType: string
  ): Promise<Response> {
    this.abortController = new AbortController();
    console.log("[ChatGPT MD] Created new AbortController for streaming request.");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw await this.handleHttpError(response, serviceType, payload, url);
      }

      if (!response.body) {
        throw new Error("The response body was empty");
      }

      return response;
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[ChatGPT MD] fetch() call was aborted.");
        throw error;
      }
      return this.handleRequestError(error, serviceType, payload, url);
    }
  }

  /**
   * Make a non-streaming API request
   * @param url The API endpoint URL
   * @param payload The request payload
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns The parsed response data
   */
  async makeNonStreamingRequest(
    url: string,
    payload: any,
    headers: Record<string, string>,
    serviceType: string
  ): Promise<any> {
    this.abortController = new AbortController();
    console.log("[ChatGPT MD] Created new AbortController for non-streaming request.");

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw await this.handleHttpError(response, serviceType, payload, url);
      }

      const json = await response.json();
      return this.apiResponseParser.parseNonStreamingResponse(json, serviceType);
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("[ChatGPT MD] Non-streaming fetch() call was aborted.");
        throw error; // Propagate abort so the UI can update correctly
      }
      return this.handleRequestError(error, serviceType, payload, url);
    } finally {
      // Ensure the controller is cleaned up after the request is complete or fails.
      this.abortController = null;
    }
  }

  /**
   * Make a GET request to fetch data
   * @param url The API endpoint URL
   * @param headers The request headers
   * @param serviceType The AI service type (openai, openrouter, ollama)
   * @returns The parsed response data
   */
  async makeGetRequest(url: string, headers: Record<string, string>, serviceType: string): Promise<any> {
    try {
      console.log(`[ChatGPT MD] Making GET request to ${serviceType}`);
      const responseObj = await requestUrl({ url, method: "GET", headers, throw: false });
      if (responseObj.status !== 200) {
        throw new Error(`Failed to fetch data from ${url}: ${responseObj.status}`);
      }
      return responseObj.json;
    } catch (error) {
      console.error(`Error making GET request to ${serviceType}:`, error);
      throw error;
    }
  }

  /**
   * Handle HTTP errors from responses
   */
  private async handleHttpError(response: Response, serviceType: string, payload: any, url: string): Promise<Error> {
    let errorData: any;
    try {
      errorData = await response.json();
    } catch (_) {
      errorData = { status: response.status, statusText: response.statusText };
    }
    const error = this.errorService.handleApiError(errorData, serviceType, {
      returnForChat: false,
      showNotification: true,
      context: { model: payload.model, url, status: response.status },
    });
    return new Error(error);
  }

  /**
   * Handle request errors
   */
  private handleRequestError(error: any, serviceType: string, payload: any, url: string): never {
    return this.errorService.handleApiError(error, serviceType, {
      returnForChat: false,
      showNotification: true,
      context: { model: payload.model, url },
    }) as never;
  }

  /**
   * Stop any ongoing API request
   */
  cancelRequest(): void {
    if (this.abortController) {
      console.log("[ChatGPT MD] Aborting request via AbortController.");
      this.abortController.abort();
      this.abortController = null;
    } else {
      console.log("[ChatGPT MD] No active AbortController to cancel.");
    }
  }
}
