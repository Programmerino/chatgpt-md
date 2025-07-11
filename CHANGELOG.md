# ChatGPT MD Changelog

## v2.6.0 (Upcoming) - Simplification & Core Focus

### Major Refactoring
- **Feature Simplification**: To improve stability and focus on the core chat experience, the following features have been removed:
  - Title Inference (`Infer Title` command and automatic inference)
  - `Add divider` command
  - `Add comment block` command and comment parsing
  - `Create new chat with highlighted text` command
  - "Generate at cursor" setting (all responses now append to the end of the note)
  - `Select Model` command (model can still be changed in frontmatter or sidebar)
- **Codebase Health**: Refactored internal services to align with Obsidian API best practices, improving file handling safety and reducing complexity.
- **API Handling**: Removed special filtering for AI models and citations to provide a more direct and unopinionated API experience.

## v2.2.0 (April 12, 2024) - Refactoring & Stability

### Feature Enhancements
- **Enhanced Streaming:** Improved reliability and performance of response streaming.

### Bug Fixes & Improvements
- **Better Error Handling**: Improved feedback for API key validation issues.
- **System Commands Fix**: Fixed an issue where system commands from frontmatter were not applied correctly.
- **Template Organization**: Templates now appear in alphabetical order in the template suggest modal (fixes #91).

### Mobile Enhancements
- **Improved Mobile Support**: Enhanced API request handling for better stability on mobile devices.

### Code Maintenance
- **OpenAI Focus**: Refactored the architecture to focus exclusively on the OpenAI API for a cleaner, more maintainable codebase.
- **Dependency Updates**: Updated project dependencies to latest versions.

## v2.1.2 (March 2024) - Stability Improvements

### Enhancements
- **Bug Fixes**: Fixed various issues reported by users after the 2.1.0 release.
- **Performance Improvements**: Enhanced overall stability and performance.

## v2.1.0 (March 2024) - UI & Model Selection

### Major Features
- **Model Selection Command**: Added a new command `ChatGPT MD: Select Model` to choose from all available OpenAI LLMs and set the current model for your note.
- **Chat Sidebar**: Introduced a dedicated sidebar view for a more conversational chat experience.

## v2.0.5 (Beta) - Service Pattern Implementation

### Enhancements
- **Service Pattern**: Implemented a cleaner service pattern for settings management.
- **Heading Improvements**: Enhanced heading prefix and default frontmatter.

## v2.0.4 (Beta) - Settings Interface

### Enhancements
- **Settings Tab Enhancement**: Added API Keys and default URLs to the settings tab for easier configuration.

## v2.0.3 (Beta) - Version Management

### Enhancements
- **Version Management**: Added comprehensive version management including beta versions.
- **Title Inference Fix**: Prevented error messages from becoming note titles.
- **API Communication**: Simplified communication between services.

## v2.0.2 (February 2024) - Model Discovery

### Enhancements
- **Model Discovery**: Added a command to list all available models from the OpenAI API.
- **Stream Management**: Improved stream handling and responsiveness.

## v2.0.1 (February 2024) - Maintenance Update

### Enhancements
- **Clear Chat Fix**: Fixed the clear chat command when frontmatter is missing.
- **Dependency Updates**: Updated all dependencies to latest versions.

## v2.0.0 (February 2024) - Architecture Overhaul

### Major Features & Improvements
- **Service Architecture**: Complete refactoring to use a streamlined, service-based architecture focused on OpenAI.
- **Enhanced Error Handling**: Better error messages and recovery mechanisms.
- **Context Links**: Added ability to include content from linked notes.
- **Model Name Display**: Added model name to assistant divider for better tracking.
- **Documentation**: Completely rewritten README with clearer instructions.

## v1.7.0 (February 2024) - Service Architecture

### Enhancements
- **Editor Service**: Improved editor service for better text handling.
- **Dependency Updates**: Updated all dependencies to latest versions.
- **Context Links**: Inline link content into messages to the API for better context.
- **Chat Delimiters**: Removed chat delimiters from inlined messages.

## v1.6.0 (January 2024) - Code Refactoring

### Code Improvements & Refactoring
- **Centralized Updates**: Streamlined statusBar updates and improved response processing.
- **Constants**: Added command IDs and other important strings as constants.
- **Service Migration**: Moved helper methods to EditorService and a dedicated OpenAiService.
- **Code Organization**: Improved code structure and imports.
- **Configuration**: Added more configuration values.
- **Model Extraction**: Extracted data structures to Models.
- **UI Components**: Moved ChatTemplatesSuggestModal and Settings to Views.

### Bug Fixes
- **Frontmatter**: Fixed missing frontmatter overwrite with default settings.
- **Title Inference**: Added check for chat folder before renaming inferred title.
- **Cherry-picked Fixes**: Included missing fixes from other branches.

### Development Updates
- **Dependencies**: Upgraded all dependencies.
- **Code Style**: Added .prettierrc configuration.
- **Build Process**: Fixed TypeScript build issues.

## v1.5.0 (April 2023) - Comment Blocks

### Features
- **ChatGPT Comments**: Added functionality to ignore parts of your notes using comment blocks.
- **Conversation Cleanup**: Added command to clear conversation except frontmatter.
- **Language Setting**: Added setting for inferring title language.

### Improvements
- **Source Mode**: New chat files now open in source mode for immediate editing.

## v1.4.3 (March 2023) - Bug Fixes

### Bug Fixes
- **Template Creation**: Fixed new chat from template when `chats` folder is missing.
- **Title Inference**: Fixed infer title error that was causing issues.

## v1.4.0-1.4.2 (March 2023) - Streaming Improvements

### Features
- **Stop Button**: Added stop button for streaming.
- **Custom URLs**: Added configurable URL support for different API endpoints.

### Bug Fixes
- **Stream Issues**: Fixed stream passthrough issues.
- **Promise Handling**: Fixed resolve/reject handling.

### Improvements
- **Mobile Experience**: Improved streaming icon behavior on mobile devices.

## v1.3.0 (March 2023) - Message Headings

### Features
- **Message Headings**: Added headings to messages for better organization.

### Improvements
- **Code Blocks**: Enhanced code block handling for better syntax highlighting.

## v1.2.0-1.2.1 (March 2023) - Streaming Enhancement

### Features
- **Streaming**: Implemented improved streaming functionality for real-time responses.

### Bug Fixes
- **SSE Logic**: Enhanced error logic for Server-Sent Events.

## v1.1.0-1.1.1 (March 2023) - Title Inference

### Features
- **Title Inference**: Added title inference functionality.
- **Platform Logic**: Added platform-specific logic for better cross-platform support.
- **Custom Dates**: Implemented custom date formatting.

### Bug Fixes
- **Streaming**: Fixed streaming bugs for smoother experience.
- **Title Inference**: Reduced message count required for title inference.

## v1.0.0-1.0.2 (March 2023) - Initial Release

### Initial Release
- **Core Functionality**: Implemented the foundation of ChatGPT MD.
- **Error Reporting**: Added comprehensive error reporting.
- **iOS Support**: Added compatibility fixes for iOS.
- **Status Bar**: Implemented status bar improvements.

### Documentation
- **README**: Added comprehensive README with usage instructions.
- **Tutorial**: Added YouTube tutorial mirror.
- **License**: Added licensing information.

---

For detailed information about each release, please visit the [GitHub repository](https://github.com/bramses/chatgpt-md).
