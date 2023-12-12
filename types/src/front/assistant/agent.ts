import { DatabaseQueryConfigurationType } from "../../front/assistant/actions/database";
import { DustAppRunConfigurationType } from "../../front/assistant/actions/dust_app_run";
import { RetrievalConfigurationType } from "../../front/assistant/actions/retrieval";
import { SupportedModel } from "../../front/lib/assistant";
import { ModelId } from "../../shared/model_id";
import { assertNever } from "../../shared/utils/assert_never";

/**
 * Agent Action configuration
 */

// New AgentActionConfigurationType checklist:
// - Add the type to the union type below
// - Add model rendering support in `renderConversationForModel`
export type AgentActionConfigurationType =
  | RetrievalConfigurationType
  | DustAppRunConfigurationType
  | DatabaseQueryConfigurationType;

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
 * Agent Message configuration
 */

export type AgentGenerationConfigurationType = {
  id: ModelId;
  prompt: string;
  model: SupportedModel;
  temperature: number;
};

/**
 * Agent configuration
 */

export type GlobalAgentStatus =
  | "active"
  | "disabled_by_admin"
  | "disabled_missing_datasource"
  | "disabled_free_workspace";
export type AgentStatus = "active" | "archived";
export type AgentConfigurationStatus = AgentStatus | GlobalAgentStatus;

/**
 * Agent configuration scope
 * - 'global' scope are Dust assistants, not editable, inside-list for all, cannot be overriden
 * - 'workspace' scope are editable by builders only,  inside-list by default but user can change it
 * - 'published' scope are editable by everybody, outside-list by default
 * - 'private' scope are editable by author only, inside-list for author, cannot be overriden (so no entry in the table
 */
export type AgentConfigurationScope =
  | "global"
  | "workspace"
  | "published"
  | "private";

/* By default, agents with scope 'workspace' are in users' assistants list, whereeas agents with
 * scope 'published' aren't. But a user can override the default behaviour, as per the type below */
export type AgentRelationOverrideType = "in-list" | "not-in-list";

/**
 * Agents can be retrieved according to different 'views':
 * - list: all agents in the user's list
 * - conversation: all agents in the user's list + agents in the current
 *   conversation (requries a conversation sId)
 * - all: workspace + published agents (not private ones), eg. for agent gallery
 * - superuser: all agents, including private ones => CAREFUL. Currently used by
 *   poke only
 * Global agents enabled for the workspace are always returned with all the views.
 */

export type AgentsGetViewType =
  | "list"
  | { conversationId: string }
  | "all"
  | "workspace"
  | "published"
  | "dust"
  | "super_user";

export type AgentConfigurationType = {
  id: ModelId;

  sId: string;
  version: number;

  scope: AgentConfigurationScope;
  relationOverride: AgentRelationOverrideType | null;
  status: AgentConfigurationStatus;

  name: string;
  description: string;
  pictureUrl: string;

  // If undefined, no action performed, otherwise the action is
  // performed (potentially NoOp eg autoSkip above).
  action: AgentActionConfigurationType | null;

  // If undefined, no text generation.
  generation: AgentGenerationConfigurationType | null;
};

export function isAgentConfigurationInList(
  agent: AgentConfigurationType
): boolean {
  if (agent.status !== "active") {
    return false;
  }
  switch (agent.scope) {
    case "global":
      return true;

    case "workspace": {
      switch (agent.relationOverride) {
        case "in-list":
          return true;
        case "not-in-list":
          return false;
        case null:
          return true;
        default:
          assertNever(agent.relationOverride);
      }
      return true;
    }
    case "published": {
      switch (agent.relationOverride) {
        case "in-list":
          return true;
        case "not-in-list":
          return false;
        case null:
          return false;
        default:
          assertNever(agent.relationOverride);
      }
      return false;
    }
    case "private":
      return false;
    default:
      assertNever(agent.scope);
  }
}
