import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  LightWorkspaceType,
  Result,
  UserType,
} from "@dust-tt/types";
import { Err, isAgentMessageType, Ok } from "@dust-tt/types";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { Op } from "sequelize";

import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import {
  createConversation,
  getConversation,
  postNewContentFragment,
} from "@app/lib/api/assistant/conversation";
import { postUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { renderUserType } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { sendEmail } from "@app/lib/email";
import {
  Conversation,
  ConversationParticipant,
} from "@app/lib/models/assistant/conversation";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { filterAndSortAgents } from "@app/lib/utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export const ASSISTANT_EMAIL_SUBDOMAIN = "run.dust.help";

export type InboundEmail = {
  subject: string;
  text: string;
  auth: { SPF: string; dkim: string };
  envelope: {
    to: string[];
    cc: string[];
    bcc: string[];
    from: string;
    full: string;
  };
};

export type EmailTriggerError = {
  type:
    | "unexpected_error"
    | "unauthenticated_error"
    | "user_not_found"
    | "workspace_not_found"
    | "invalid_email_error"
    | "assistant_not_found"
    | "message_creation_error";
  message: string;
};

export function getTargetEmailsForWorkspace({
  allTargetEmails,
  workspace,
  isDefault,
}: {
  allTargetEmails: string[];
  workspace: LightWorkspaceType;
  isDefault: boolean;
}): string[] {
  return allTargetEmails.filter(
    (email) =>
      email.split("@")[0].endsWith(`[${workspace.sId}]`) ||
      // calls with no brackets go to default workspace
      (!email.split("@")[0].endsWith("]") && isDefault)
  );
}

export async function userAndWorkspacesFromEmail({
  email,
}: {
  email: string;
}): Promise<
  Result<
    {
      workspaces: LightWorkspaceType[];
      user: UserType;
      defaultWorkspace: LightWorkspaceType;
    },
    EmailTriggerError
  >
> {
  const user = await User.findOne({
    where: { email },
  });

  if (!user) {
    return new Err({
      type: "user_not_found",
      message:
        `Failed to match a valid Dust user for email: ${email}. ` +
        `Please sign up for Dust at https://dust.tt to interact with assitsants over email.`,
    });
  }
  const workspaces = await Workspace.findAll({
    include: [
      {
        model: MembershipModel,
        where: {
          userId: user.id,
          endAt: {
            [Op.or]: [{ [Op.is]: null }, { [Op.gte]: new Date() }],
          },
        },
      },
    ],
  });

  if (!workspaces) {
    return new Err({
      type: "workspace_not_found",
      message:
        `Failed to match a valid Dust workspace associated with email: ${email}. ` +
        `Please sign up for Dust at https://dust.tt to interact with assistants over email.`,
    });
  }

  // get latest conversation participation from user
  const latestParticipation = await ConversationParticipant.findOne({
    where: {
      userId: user.id,
    },
    include: [
      {
        model: Conversation,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  // TODO: implement good default logic
  // a. most members?
  // b. most recent activity?
  const workspace = workspaces.find(
    (w) => w.id === latestParticipation?.conversation?.workspaceId
  );
  if (!workspace) {
    return new Err({
      type: "unexpected_error",
      message: "Failed to find a valid default workspace for user.",
    });
  }

  const defaultWorkspace = renderLightWorkspaceType({
    workspace,
  });

  return new Ok({
    workspaces: workspaces.map((workspace) =>
      renderLightWorkspaceType({ workspace })
    ),
    user: renderUserType(user),
    defaultWorkspace,
  });
}

export async function emailAssistantMatcher({
  auth,
  targetEmail,
}: {
  auth: Authenticator;
  targetEmail: string;
}): Promise<
  Result<
    {
      agentConfiguration: LightAgentConfigurationType;
    },
    EmailTriggerError
  >
> {
  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: "list",
    variant: "light",
    limit: undefined,
    sort: undefined,
  });

  const agentPrefix = targetEmail.split("@")[0];

  const matchingAgents = filterAndSortAgents(agentConfigurations, agentPrefix);
  if (matchingAgents.length === 0) {
    return new Err({
      type: "assistant_not_found",
      message: `Failed to match a valid assistant with name prefix: '${agentPrefix}'.`,
    });
  }
  const agentConfiguration = matchingAgents[0];

  return new Ok({
    agentConfiguration,
  });
}

export async function splitThreadContent(
  threadContent: string
): Promise<{ userMessage: string; restOfThread: string }> {
  const lines = threadContent.split("\n");
  let userMessage = "";
  let restOfThread = "";
  let foundUserMessage = false;
  for (const line of lines) {
    if (foundUserMessage) {
      restOfThread += line + "\n";
    } else {
      if (line.startsWith("On ") && line.includes(" wrote:")) {
        foundUserMessage = true;
      } else if (line.startsWith("---------- Forwarded message ---------")) {
        foundUserMessage = true;
      } else {
        userMessage += line + "\n";
      }
    }
  }

  return { userMessage: userMessage.trim(), restOfThread: restOfThread.trim() };
}

export async function triggerFromEmail({
  auth,
  agentConfigurations,
  email,
}: {
  auth: Authenticator;
  agentConfigurations: LightAgentConfigurationType[];
  email: InboundEmail;
}): Promise<
  Result<
    {
      conversation: ConversationType;
      answers: {
        agentConfiguration: LightAgentConfigurationType;
        agentMessage: AgentMessageType;
        html: string;
      }[];
    },
    EmailTriggerError
  >
> {
  const localLogger = logger.child({});
  const user = auth.user();
  if (!user) {
    return new Err({
      type: "unexpected_error",
      message:
        "An unexpected error occurred. Please try again or contact us at team@dust.tt.",
    });
  }

  let conversation = await createConversation(auth, {
    title: `Email: ${email.subject}`,
    visibility: "unlisted",
  });

  const { userMessage, restOfThread } = await splitThreadContent(email.text);

  // console.log("USER_MESSAGE", userMessage);
  // console.log("REST_OF_THREAD", restOfThread, restOfThread.length);

  if (restOfThread.length > 0) {
    await postNewContentFragment(auth, {
      conversation,
      title: `Email thread: ${email.subject}`,
      content: restOfThread,
      url: null,
      contentType: "file_attachment",
      context: {
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePictureUrl: user.image,
      },
    });

    const updatedConversation = await getConversation(auth, conversation.sId);
    if (updatedConversation) {
      conversation = updatedConversation;
    }
  }

  const content =
    agentConfigurations
      .map((agent) => {
        return `:mention[${agent.name}]{sId=${agent.sId}}`;
      })
      .join(" ") +
    " " +
    userMessage;

  const mentions = agentConfigurations.map((agent) => {
    return { configurationId: agent.sId };
  });

  const messageRes = await postUserMessageWithPubSub(
    auth,
    {
      conversation,
      content,
      mentions,
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        profilePictureUrl: user.image,
      },
    },
    { resolveAfterFullGeneration: true }
  );

  if (messageRes.isErr()) {
    return new Err({
      type: "message_creation_error",
      message:
        `Error interacting with assistant: ` +
        messageRes.error.api_error.message,
    });
  }

  const updatedConversation = await getConversation(auth, conversation.sId);
  if (updatedConversation) {
    conversation = updatedConversation;
  }

  localLogger.info(
    {
      conversation: {
        sId: conversation.sId,
      },
    },
    "[email] Created conversation."
  );

  // console.log(conversation.content);

  // Last versions of each agent messages.
  const agentMessages = agentConfigurations.map((ac) => {
    const agentMessages = conversation.content.find((versions) => {
      const item = versions[versions.length - 1];
      return (
        item && isAgentMessageType(item) && item.configuration.sId === ac.sId
      );
    }) as AgentMessageType[];
    const last = agentMessages[agentMessages.length - 1];
    return { agentConfiguration: ac, agentMessage: last };
  });

  const answers = await Promise.all(
    agentMessages.map(async ({ agentConfiguration, agentMessage }) => {
      return {
        agentConfiguration,
        agentMessage,
        html: sanitizeHtml(await marked.parse(agentMessage.content || ""), {
          // Allow images on top of all defaults from https://www.npmjs.com/package/sanitize-html
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
        }),
      };
    })
  );

  return new Ok({ conversation, answers });
}

export async function replyToEmail({
  email,
  agentConfiguration,
  htmlContent,
}: {
  email: InboundEmail;
  agentConfiguration?: LightAgentConfigurationType;
  htmlContent: string;
}) {
  const name = agentConfiguration
    ? `Dust Assistant (${agentConfiguration.name})`
    : "Dust Assistant";
  const sender = agentConfiguration
    ? `${agentConfiguration.name}@${ASSISTANT_EMAIL_SUBDOMAIN}`
    : `assistants@${ASSISTANT_EMAIL_SUBDOMAIN}`;

  // subject: if Re: is there, we don't add it.
  const subject = email.subject
    .toLowerCase()
    .replaceAll(" ", "")
    .startsWith("re:")
    ? email.subject
    : `Re: ${email.subject}`;

  const quote = email.text
    .replaceAll(">", "&gt;")
    .replaceAll("<", "&lt;")
    .split("\n")
    .join("<br/>\n");

  const html =
    "<div>\n" +
    htmlContent +
    `<br/><br/>` +
    `On ${new Date().toUTCString()} ${email.envelope.full} wrote:<br/>\n` +
    `<blockquote class="quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">\n` +
    `${quote}` +
    `</blockquote>\n` +
    "<div>\n";

  const msg = {
    from: {
      name,
      email: sender,
    },
    reply_to: sender,
    subject,
    html,
  };

  await sendEmail(email.envelope.from, msg);
}
