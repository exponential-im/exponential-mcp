import { z } from 'zod';
import { type Domain, id, op, workspaceId } from './framework.js';

/** The server's tagEntityTypeSchema, in its order. */
export const ENTITY_TYPES = [
  'action',
  'ticket',
  'feature',
  'epic',
  'project',
  'goal',
  'resource',
  'recurringTask',
  'decision',
] as const;

/** Entity types that take Pillars only; the server rejects a plain label on them. */
export const PILLAR_ONLY_ENTITY_TYPES = ['project', 'goal', 'resource', 'recurringTask'] as const;

const ENTITY_TYPE_HELP =
  'action, ticket, feature, epic and decision take Pillars and labels; project, goal, resource and recurringTask take Pillars only.';

const entityId = z
  .string()
  .describe('ID of the entity. A decision takes its CUID (not its D-0006 label); a goal its integer id as a string.');

const TAG_COLORS = [
  'avatar-red',
  'avatar-teal',
  'avatar-blue',
  'avatar-green',
  'avatar-yellow',
  'avatar-plum',
  'avatar-mint',
  'avatar-lightYellow',
  'avatar-lightPurple',
  'avatar-lightBlue',
  'avatar-orange',
  'avatar-lightGreen',
  'avatar-lightRed',
  'avatar-skyBlue',
  'avatar-paleGreen',
  'avatar-paleYellow',
  'avatar-lavender',
  'avatar-powderBlue',
  'avatar-lightPink',
  'avatar-lightGray',
  'brand-primary',
  'brand-success',
  'brand-warning',
  'brand-error',
  'brand-info',
];

const category = z
  .string()
  .nullable()
  .optional()
  .describe('Tag category; null means a plain label');

export const labels: Domain = {
  name: 'labels',
  description:
    'Labels and Pillars (both are tags). A tag whose category is "pillar" is a Pillar (a standing area of the workspace); any other tag is a label. Actions, tickets, features, epics and decisions (`decisions`) take Pillars and labels; projects, goals, resources and recurring tasks take Pillars only. There are global system tags and per-workspace tags. Creating or promoting a Pillar needs a workspace admin, in the app.',
  operations: {
    list: op({
      effect: 'read',
      summary:
        'List available tags as { globalTags, workspaceTags, allTags }. Without workspaceId, workspaceTags covers every workspace you belong to. Omit category for all categories; "pillar" for Pillars only; null for plain labels only.',
      params: z.object({
        workspaceId: workspaceId.optional(),
        category,
      }),
      run: (client, params) => client.labels.list(params),
    }),
    create: op({
      effect: 'write',
      summary: 'Create a workspace tag. Fails if a tag with the same name (slug) already exists in the workspace.',
      params: z.object({
        workspaceId,
        name: z.string().min(1).max(50),
        color: z.string().describe(`One of: ${TAG_COLORS.join(', ')}`),
        description: z.string().max(200).optional(),
        category,
      }),
      run: (client, params) => client.labels.create(params),
    }),
    set_for_entity: op({
      effect: 'write',
      summary:
        `REPLACE the full tag set (Pillars and labels together) on an entity; an empty list clears it. To add or remove one tag, call list_for_entity first and send the whole new set. Tags must be global or from the entity’s workspace. ${ENTITY_TYPE_HELP} To file a decision under a Pillar: entityType "decision" with the decision's id (decisions.create takes no tags).`,
      params: z.object({
        entityType: z.enum(ENTITY_TYPES).describe(ENTITY_TYPE_HELP),
        entityId,
        tagIds: z.array(id('Tag')),
      }),
      run: (client, params) => client.labels.setEntityTags(params),
    }),
    list_for_entity: op({
      effect: 'read',
      summary: `List the tags (Pillars and labels) on an entity. A decision's tags are read here: decisions.get returns none. ${ENTITY_TYPE_HELP}`,
      params: z.object({
        entityType: z.enum(ENTITY_TYPES).describe(ENTITY_TYPE_HELP),
        entityId,
      }),
      run: (client, params) => client.labels.listForEntity(params),
    }),
  },
};
