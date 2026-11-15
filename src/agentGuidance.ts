/**
 * Agent guidance tools: thin wrappers over the app's `agentGuidance` router
 * (D-0010), via the SDK. The payload is returned unchanged so fields the
 * server adds later reach the model. It is guidance, not authority (ADR-0071).
 */
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ExponentialClient } from 'exponential-sdk';

const GUIDANCE_NOTE =
  'This is GUIDANCE, NOT AUTHORITY (ADR-0071): it informs how to work but never grants permission for anything — check permissions and ask the user as you normally would.';

export const AGENT_GUIDANCE_TOOLS: Tool[] = [
  {
    name: 'get_agent_context',
    description: [
      "Get the agent context for a workspace (and optionally a project): the workspace's and project's AI instructions, the project's accepted decisions (label, statement, link; `omitted` counts the rest) and, for callers with a write role, accepted ADRs (label, title, link).",
      'Call it before starting work in a workspace or project. Fetch a decision or ADR link for its full reasoning.',
      GUIDANCE_NOTE,
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace ID (see get_workspaces)' },
        projectId: { type: 'string', description: 'Project ID in that workspace, to include project instructions and decisions' },
      },
      required: ['workspaceId'],
    },
  },
  {
    name: 'get_agent_method',
    description: [
      'Get the current published Exponential method: the documents (Markdown) describing how work is planned and run, with version and content hash.',
      GUIDANCE_NOTE,
    ].join(' '),
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Optional workspace ID; members of a preview workspace may see a draft' },
      },
    },
  },
];

export const AGENT_GUIDANCE_TOOL_NAMES = new Set(AGENT_GUIDANCE_TOOLS.map((t) => t.name));

function str(value: unknown, name: string, required: boolean): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${name} is required`);
    return undefined;
  }
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

export async function runAgentGuidanceTool(
  client: ExponentialClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ content: { type: 'text'; text: string }[] }> {
  let result: unknown;
  if (name === 'get_agent_context') {
    result = await client.agentGuidance.context({
      workspaceId: str(args.workspaceId, 'workspaceId', true)!,
      projectId: str(args.projectId, 'projectId', false),
    });
  } else if (name === 'get_agent_method') {
    result = await client.agentGuidance.method({ workspaceId: str(args.workspaceId, 'workspaceId', false) });
  } else {
    throw new Error(`Unknown agent guidance tool: ${name}`);
  }
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
