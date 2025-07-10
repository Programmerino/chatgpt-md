import { Notice } from "obsidian";

/**
 * Service for handling notifications and user feedback
 */
export class NotificationService {
  private statusBarItem: HTMLElement | null = null;

  setStatusBarItem(item: HTMLElement) {
    this.statusBarItem = item;
  }

  /**
   * Show a notification to the user
   * @param message The message to display
   * @param duration The duration in milliseconds to show the notification
   */
  showNotification(message: string, duration: number = 5000): void {
    new Notice(message, duration);
  }

  /**
   * Show a message in the status bar. It will be cleared automatically after the timeout.
   * @param message The message to display.
   * @param timeout The duration in milliseconds before clearing the message. 0 for persistent.
   */
  showStatusBarMessage(message: string, timeout: number = 5000): void {
    if (!this.statusBarItem) return;

    this.statusBarItem.setText(`[ChatGPT MD] ${message}`);
    this.statusBarItem.style.display = "";

    if (timeout > 0) {
      setTimeout(() => {
        // Clear only if the message hasn't changed
        if (this.statusBarItem?.getText() === `[ChatGPT MD] ${message}`) {
          this.clearStatusBar();
        }
      }, timeout);
    }
  }

  /**
   * Clears any message from the status bar.
   */
  clearStatusBar(): void {
    if (!this.statusBarItem) return;
    this.statusBarItem.setText("");
    this.statusBarItem.style.display = "none";
  }

  /**
   * Show a success notification
   * @param message The success message
   */
  showSuccess(message: string): void {
    this.showNotification(`✅ ${message}`, 3000);
  }

  /**
   * Show a warning notification
   * @param message The warning message
   */
  showWarning(message: string): void {
    this.showNotification(`⚠️ ${message}`, 5000);
  }

  /**
   * Show an error notification
   * @param message The error message
   */
  showError(message: string): void {
    this.showNotification(`❌ ${message}`, 7000);
  }
}
