/**
 * Tool annotations (MCP `ToolAnnotations`) for the hand-written, guidance and
 * run tools. Domain tools derive theirs from their operations' effects
 * (`domains/framework.ts`). No hand-written tool deletes anything.
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type ToolAnnotations = NonNullable<Tool['annotations']>;

/** A tool that changes nothing. */
export const reads = (title: string): ToolAnnotations => ({ title, readOnlyHint: true, destructiveHint: false });

/** A tool that creates or changes data and deletes nothing. */
export const writes = (title: string): ToolAnnotations => ({ title, readOnlyHint: false, destructiveHint: false });
