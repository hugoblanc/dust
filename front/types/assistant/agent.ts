import { ModelId } from "@app/lib/databases";
import { RetrievalConfigurationType } from "@app/types/assistant/actions/retrieval";

/**
 * Agent Action configuration
 */

// New AgentActionConfigurationType checklist:
// - Add the type to the union type below
// - Add model rendering support in `renderConversationForModel`
export type AgentActionConfigurationType = RetrievalConfigurationType;

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
  model: {
    providerId: string;
    modelId: string;
  };
};

/**
 * Agent configuration
 */

export type AgentConfigurationStatus = "active" | "archived";
export type AgentConfigurationScope = "global" | "workspace";

export type AgentConfigurationType = {
  id: ModelId;
  sId: string;
  status: AgentConfigurationStatus;

  name: string;
  pictureUrl: string | null;

  // If undefined, no action performed, otherwise the action is
  // performed (potentially NoOp eg autoSkip above).
  action: AgentActionConfigurationType | null;

  // If undefined, no text generation.
  generation: AgentGenerationConfigurationType | null;
};
