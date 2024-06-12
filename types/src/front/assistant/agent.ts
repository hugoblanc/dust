import { DustAppRunConfigurationType } from "../../front/assistant/actions/dust_app_run";
import { ProcessConfigurationType } from "../../front/assistant/actions/process";
import { RetrievalConfigurationType } from "../../front/assistant/actions/retrieval";
import { TablesQueryConfigurationType } from "../../front/assistant/actions/tables_query";
import { ModelIdType, ModelProviderIdType } from "../../front/lib/assistant";
import { ModelId } from "../../shared/model_id";
import { BrowseConfigurationType } from "./actions/browse";
import { WebsearchConfigurationType } from "./actions/websearch";

/**
 * Agent Action configuration
 */

// New AgentActionConfigurationType checklist:
// - Add the type to the union type below
// - Add model rendering support in `renderConversationForModel`
export type AgentActionConfigurationType =
  | TablesQueryConfigurationType
  | RetrievalConfigurationType
  | DustAppRunConfigurationType
  | ProcessConfigurationType
  | WebsearchConfigurationType
  | BrowseConfigurationType;

export type AgentAction = AgentActionConfigurationType["type"];

// Each AgentActionConfigurationType is capable of generating this type at runtime to specify which
// inputs should be generated by the model. As an example, to run the retrieval action for which the
// `relativeTimeFrame` has been specified in the configuration but for which the `query` is "auto",
// it would generate:
//
// ```
// { inputs: [{ name: "query", description: "...", type: "string" }]
// ```
//
// The params generator model for this action would be tasked to generate that query. If the
// retrieval configuration sets `relativeTimeFrame` to "auto" as well we would get:
//
// ```
// {
//   inputs: [
//     { name: "query", description: "...", type: "string" },
//     { name: "relativeTimeFrame", description: "...", type: "string" },
//   ]
// }
// ```
export type AgentActionSpecification = {
  name: string;
  description: string;
  inputs: {
    name: string;
    description: string;
    type: "string" | "number" | "boolean";
  }[];
};

/**
 * Agent configuration
 */

export type GlobalAgentStatus =
  | "active"
  | "disabled_by_admin"
  | "disabled_missing_datasource"
  | "disabled_free_workspace";

/**
 * Agent statuses:
 * - "active" means the agent can be used directly
 * - "archived" means the agent was either deleted, or that there is a newer
 *   version
 * - "draft" is used for the "try" button in builder, when the agent is not yet
 *   fully created / updated
 */
export type AgentStatus = "active" | "archived" | "draft";
export type AgentConfigurationStatus = AgentStatus | GlobalAgentStatus;

/**
 * Agent configuration scope
 * - 'global' scope are Dust assistants, not editable, inside-list for all, cannot be overriden
 * - 'workspace' scope are editable by builders only,  inside-list by default but user can change it
 * - 'published' scope are editable by everybody, outside-list by default
 * - 'private' scope are editable by author only, inside-list for author, cannot be overriden (so no
 *   entry in the table
 */
export type AgentConfigurationScope =
  | "global"
  | "workspace"
  | "published"
  | "private";

/* By default, agents with scope 'workspace' are in users' assistants list, whereeas agents with
 * scope 'published' aren't. A user can override the default behaviour by adding / removing from
 * their list. List status is enforced by the type below. */
export type AgentUserListStatus = "in-list" | "not-in-list";

/**
 * Defines strategies for fetching agent configurations based on various
 * 'views':
 * - 'list': Retrieves all agents within the user's list, including their
 *   private agents, agents from the workspace and global scope, plus any
 *   published agents they've added to their list (refer to
 *   AgentUserRelationTable).
 * - {agentId: string}: Retrieves a single agent by its ID.
 * - {conversationId: string}: all agent from the user's list view, plus the
 *   agents mentioned in the conversation with the provided Id.
 * - 'all': Combines workspace and published agents, excluding private agents.
 *   Typically used in agent galleries.
 * - 'assistants-search': retrieves all global agents including inactive ones, all workspace, all
 *   published and the user's private agents.
 * - 'workspace': Retrieves all agents exclusively with a 'workspace' scope.
 * - 'published': Retrieves all agents exclusively with a 'published' scope.
 * - 'global': Retrieves all agents exclusively with a 'global' scope.
 * - 'admin_internal': Grants access to all agents, including private ones.
 * - 'archived': Retrieves all agents that are archived. Only available to super users.
 *   Intended strictly for internal use with necessary superuser or admin
 *   authorization.
 */
export type AgentsGetViewType =
  | { agentId: string; allVersions?: boolean }
  | "list"
  | { conversationId: string }
  | "all"
  | "assistants-search"
  | "workspace"
  | "published"
  | "global"
  | "admin_internal"
  | "archived";

export type AgentUsageType = {
  userCount: number;
  messageCount: number;
  usersWithAgentInListCount: number;

  // userCount and messageCount are over the last `timePeriodSec` seconds
  timePeriodSec: number;
};

export type AgentRecentAuthors = readonly string[];

export type AgentModelConfigurationType = {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  temperature: number;
};

export type LightAgentConfigurationType = {
  id: ModelId;

  versionCreatedAt: string | null;

  sId: string;
  version: number;
  // Global agents have a null authorId, others have a non-null authorId
  versionAuthorId: ModelId | null;

  instructions: string | null;

  model: AgentModelConfigurationType;

  status: AgentConfigurationStatus;
  scope: AgentConfigurationScope;

  // Set to null if not in the context of a user (API query). Otherwise, set to the list status for
  // the current user.
  userListStatus: AgentUserListStatus | null;

  name: string;
  description: string;
  pictureUrl: string;

  // `lastAuthors` is expensive to compute, so we only compute it when needed.
  lastAuthors?: AgentRecentAuthors;
  // Usage is expensive to compute, so we only compute it when needed.
  usage?: AgentUsageType;

  maxToolsUsePerRun: number;

  templateId: string | null;
};

export type AgentConfigurationType = LightAgentConfigurationType & {
  // If empty, no actions are performed, otherwise the actions are
  // performed.
  actions: AgentActionConfigurationType[];
};

export interface TemplateAgentConfigurationType {
  name: string;
  pictureUrl: string;

  scope: AgentConfigurationScope;
  description: string;
  model: AgentModelConfigurationType;
  actions: AgentActionConfigurationType[];
  instructions: string | null;
  isTemplate: true;
}

export const MAX_TOOLS_USE_PER_RUN_LIMIT = 8;
