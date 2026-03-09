/**
 * Parse <think>...</think> blocks from reasoning models (deepseek-r1, qwq, etc.)
 * Returns the thinking content and the final response separately.
 */

export interface ParsedThinking {
  thinking: string;
  response: string;
}

/**
 * Extract thinking blocks from model output.
 * Handles:
 *  - Complete: <think>reasoning</think>response
 *  - Multiple: <think>a</think>mid<think>b</think>response
 *  - Streaming partial: <think>partial reasoning (no closing tag yet)
 */
export function parseThinkingBlocks(content: string): ParsedThinking {
  if (!content.includes('<think>')) {
    return { thinking: '', response: content };
  }

  const thinkingParts: string[] = [];
  let remaining = content;

  // Extract all complete <think>...</think> blocks
  const completePattern = /<think>([\s\S]*?)<\/think>/g;
  let match: RegExpExecArray | null;

  while ((match = completePattern.exec(content)) !== null) {
    thinkingParts.push(match[1].trim());
  }

  // Remove all complete blocks from the response
  remaining = content.replace(completePattern, '');

  // Handle unclosed <think> block (streaming in progress)
  const unclosedMatch = remaining.match(/<think>([\s\S]*)$/);
  if (unclosedMatch) {
    thinkingParts.push(unclosedMatch[1].trim());
    remaining = remaining.replace(/<think>[\s\S]*$/, '');
  }

  return {
    thinking: thinkingParts.join('\n\n'),
    response: remaining.trim(),
  };
}

/**
 * Check if content contains any thinking blocks.
 */
export function hasThinkingContent(content: string): boolean {
  return content.includes('<think>');
}
