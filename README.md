# ChatGPT MD

🚀 A seamless integration of OpenAI's ChatGPT into Obsidian.

![Chatting with the new sidebar](images/chat-with-sidebar.gif)

## What's New 🚀
- **✨ New Chat Sidebar:** A dedicated sidebar view for a more natural, conversational chat experience. Toggle it with the `ChatGPT MD: Toggle Chat Sidebar` command.
- **⚙️ Inline Parameter Editing:** Click the new settings icon in the chat sidebar header to quickly tweak the model, system prompt, and temperature for the active chat note.
- **Improved Streaming:** More reliable and performant streaming for both the editor and the new sidebar.
- **Simplified Experience:** The plugin now focuses exclusively on providing the best possible OpenAI integration.

## A simple and quick Start 🏁
Get started in just a few simple steps:

1.  **Install ChatGPT MD**: Go to `Settings > Community Plugins > Browse`, search for `ChatGPT MD` and click `Install`.
2.  **Add your OpenAI API key**: In the plugin settings, add your OpenAI API key.
3.  **Start chatting**: Use the `ChatGPT MD: Chat` command (`cmd + p` or `ctrl + p`) to start a conversation from any note, or open the new Chat Sidebar.

💡 *Pro tip*: Set up a hotkey for the best experience! Go to `Settings > Hotkeys`, search for `ChatGPT MD: Chat` and add your preferred keybinding (e.g., `cmd + j`).

Start chatting, don't worry too much about the more advanced features. They will come naturally :-)

## Features
* **Interactive conversations**:
  * Engage directly with ChatGPT from any Markdown note, edit questions or responses on-the-fly, and continue the chat seamlessly.
  * Use the new **Chat Sidebar** for a more fluid, app-like conversation flow.
* **Privacy & Control:**
  * All chat notes are stored locally in your vault.
  * Zero tracking and no 3rd party integrations except direct calls to the OpenAI API.
* **Link context**:
  * Provide links to any other note in your vault for added context during conversations with Markdown or Wiki links.
* **Per-note Configuration:**
  * Overwrite default settings via frontmatter for individual notes using params from the [OpenAI API](https://platform.openai.com/docs/api-reference/chat).
* **Markdown Support:**
  * Enjoy full rendering of lists, code blocks, and more from all responses.
* **Minimal Setup:**
  * Simply provide your OpenAI API key to get started.
* **Chat Templates**:
  * Use and share frontmatter templates for recurring scenarios.

## Privacy and Security

ChatGPT MD is
- only storing data locally in your vault, with zero tracking and no 3rd party integrations except direct calls to the OpenAI API.

### Default Configuration
The plugin comes with a well-balanced pre-configuration to get you started immediately.
You can change the global settings or use local parameters in any note via frontmatter.
```
---
system_commands: ['I am a helpful assistant.']
model: gpt-4o-mini
stream: true
---
```
You can also use any other parameters from the [OpenAI API documentation](https://platform.openai.com/docs/api-reference/chat).

### Commands 👨‍💻
Run commands from Obsidian's command pallet via `cmd + p` or `ctrl + p` and start typing `chatgpt` or set hotkeys.

#### Main Commands
- **Chat**: Parse the file and interact with ChatGPT. Assign a hotkey, e.g. `cmd + j`.
- **Toggle Chat Sidebar**: Opens or closes the new dedicated chat interface in the right sidebar.

#### Creation Commands
- **New Chat From Template**: Create chats from templates.

#### Utility Commands
- **Clear Chat**: Clears the conversation history from the current note, preserving only the frontmatter.
- **Stop AI Generation**: Force-stops any in-progress response from the AI.
- **Debug: Create Request Note**: Creates a new note containing the raw API request payload for debugging purposes.

## Contributions Welcome 🤝
Pull requests, bug reports, and all other forms of contribution are welcomed and highly encouraged!* :octocat:

Happy writing with ChatGPT MD! 💻 🎉
