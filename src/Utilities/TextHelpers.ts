import { parseYaml } from "obsidian";
import {
  HORIZONTAL_LINE_MD,
  MAX_HEADING_LEVEL,
  NEWLINE,
  ROLE_ASSISTANT,
  ROLE_DEVELOPER,
  ROLE_IDENTIFIER,
  ROLE_USER,
} from "src/Constants";

export const unfinishedCodeBlock = (txt: string): boolean => {
  const codeBlockMatches = txt.match(/```/g) || [];
  const isUnclosed = codeBlockMatches.length % 2 !== 0;

  if (isUnclosed) {
    console.log("[ChatGPT MD] Unclosed code block detected");
  }

  return isUnclosed;
};

const cleanupRole = (role: string): string => {
  const trimmedRole = role.trim().toLowerCase();

  const roles = [ROLE_USER, ROLE_ASSISTANT, ROLE_DEVELOPER];

  const foundRole = roles.find((r) => trimmedRole.includes(r));

  if (foundRole) {
    return foundRole;
  }

  throw new Error(`Failed to extract role from input: "${role}"`);
};

export const extractRoleAndMessage = (message: string) => {
  try {
    if (!message.includes(ROLE_IDENTIFIER)) {
      return {
        role: ROLE_USER,
        content: message,
      };
    }

    const [roleSection, ...contentSections] = message.split(ROLE_IDENTIFIER)[1].split("\n");

    const cleanedRole = cleanupRole(roleSection);

    return {
      role: cleanedRole,
      content: contentSections.join("\n").trim(),
    };
  } catch (error) {
    throw new Error(`Failed to extract role and message: ${error}`);
  }
};

export const removeCommentsFromMessages = (message: string) => {
  try {
    const commentBlock = /=begin-chatgpt-md-comment[\s\S]*?=end-chatgpt-md-comment/g;

    // remove comment block
    return message.replace(commentBlock, "");
  } catch (err) {
    throw new Error("Error removing comments from messages" + err);
  }
};

const generateDatePattern = (format: string) => {
  const pattern = format
    .replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") // Escape any special characters
    .replace("YYYY", "\\d{4}") // Match exactly four digits for the year
    .replace("MM", "\\d{2}") // Match exactly two digits for the month
    .replace("DD", "\\d{2}") // Match exactly two digits for the day
    .replace("hh", "\\d{2}") // Match exactly two digits for the hour
    .replace("mm", "\\d{2}") // Match exactly two digits for the minute
    .replace("ss", "\\d{2}"); // Match exactly two digits for the second

  return new RegExp(`^${pattern}$`);
};

export const isTitleTimestampFormat = (title: string = "", dateFormat: string): boolean => {
  return title?.length == dateFormat.length && generateDatePattern(dateFormat).test(title);
};

export const getHeadingPrefix = (headingLevel: number) => {
  if (headingLevel === 0) {
    return "";
  } else if (headingLevel > MAX_HEADING_LEVEL) {
    return "#".repeat(MAX_HEADING_LEVEL) + " ";
  }
  return "#".repeat(headingLevel) + " ";
};

export const getHeaderRole = (headingPrefix: string, role: string, model?: string) =>
  `${NEWLINE}${HORIZONTAL_LINE_MD}${NEWLINE}${headingPrefix}${ROLE_IDENTIFIER}${role}${model ? `<span style="font-size: small;"> (${model})</span>` : ``}${NEWLINE}`;

export const parseSettingsFrontmatter = (yamlString: string): Record<string, any> => {
  if (!yamlString) {
    return {};
  }
  // Remove the --- markers and trim whitespace
  const content = yamlString
    .replace(/^---\s*\n?/, "")
    .replace(/\n?---\s*$/, "")
    .trim();

  // If content is empty after trimming, return empty object
  if (!content) {
    return {};
  }

  try {
    const parsed = parseYaml(content);
    // Ensure we return an object, even if parsing results in null/undefined/etc.
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch (e) {
    console.error("Error parsing YAML frontmatter from settings:", e);
    return {};
  }
};

export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

export const splitMessages = (text: string | undefined): string[] => (text ? text.split(HORIZONTAL_LINE_MD) : []);

export const removeYAMLFrontMatter = (note: string | undefined): string | undefined => {
  if (!note) return note;

  // Check if the note starts with frontmatter
  if (!note.trim().startsWith("---")) {
    return note;
  }

  // Find the end of frontmatter
  const lines = note.split("\n");
  let endIndex = -1;

  // Skip first line (opening ---)
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) {
    // No closing ---, return original note
    return note;
  }

  // Return content after frontmatter
  return lines
    .slice(endIndex + 1)
    .join("\n")
    .trim();
};
