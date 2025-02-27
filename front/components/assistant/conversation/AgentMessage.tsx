import {
  ArrowPathIcon,
  Button,
  Chip,
  Citation,
  ClipboardIcon,
  DocumentDuplicateIcon,
  DropdownMenu,
  EyeIcon,
  Icon,
  PuzzleIcon,
} from "@dust-tt/sparkle";
import type {
  AgentActionSpecificEvent,
  AgentActionSuccessEvent,
  AgentActionType,
  AgentChainOfThoughtEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  RetrievalActionType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { RetrievalDocumentType } from "@dust-tt/types";
import type { AgentMessageType, MessageReactionType } from "@dust-tt/types";
import {
  assertNever,
  isRetrievalActionType,
  removeNulls,
} from "@dust-tt/types";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useContext, useEffect, useRef, useState } from "react";

import { makeDocumentCitations } from "@app/components/actions/retrieval/utils";
import { AgentMessageActions } from "@app/components/assistant/conversation/actions/AgentMessageActions";
import { AssistantEditionMenu } from "@app/components/assistant/conversation/AssistantEditionMenu";
import type { MessageSizeType } from "@app/components/assistant/conversation/ConversationMessage";
import { ConversationMessage } from "@app/components/assistant/conversation/ConversationMessage";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { CONVERSATION_PARENT_SCROLL_DIV_ID } from "@app/components/assistant/conversation/lib";
import { RenderMessageMarkdown } from "@app/components/assistant/RenderMessageMarkdown";
import { useEventSource } from "@app/hooks/useEventSource";
import { useSubmitFunction } from "@app/lib/client/utils";

function cleanUpCitations(message: string): string {
  const regex = / ?:cite\[[a-zA-Z0-9, ]+\]/g;
  return message.replace(regex, "");
}

interface AgentMessageProps {
  message: AgentMessageType;
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  reactions: MessageReactionType[];
  isInModal?: boolean;
  hideReactions?: boolean;
  size: MessageSizeType;
}

/**
 *
 * @param isInModal is the conversation happening in a side modal, i.e. when
 * testing an assistant? see conversation/Conversation.tsx
 * @returns
 */
export function AgentMessage({
  message,
  owner,
  user,
  conversationId,
  reactions,
  isInModal,
  hideReactions,
  size,
}: AgentMessageProps) {
  const [streamedAgentMessage, setStreamedAgentMessage] =
    useState<AgentMessageType>(message);

  const [isRetryHandlerProcessing, setIsRetryHandlerProcessing] =
    useState<boolean>(false);

  const [references, setReferences] = useState<{
    [key: string]: RetrievalDocumentType;
  }>({});

  const [activeReferences, setActiveReferences] = useState<
    { index: number; document: RetrievalDocumentType }[]
  >([]);

  const shouldStream = (() => {
    if (message.status !== "created") {
      return false;
    }

    switch (streamedAgentMessage.status) {
      case "succeeded":
      case "failed":
      case "cancelled":
        return false;
      case "created":
        return true;
      default:
        assertNever(streamedAgentMessage.status);
    }
  })();

  const [lastTokenClassification, setLastTokenClassification] = useState<
    null | "tokens" | "chain_of_thought"
  >(null);

  const buildEventSourceURL = useCallback(
    (lastEvent: string | null) => {
      if (!shouldStream) {
        return null;
      }
      const esURL = `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/events`;
      let lastEventId = "";
      if (lastEvent) {
        const eventPayload: {
          eventId: string;
        } = JSON.parse(lastEvent);
        lastEventId = eventPayload.eventId;
      }
      const url = esURL + "?lastEventId=" + lastEventId;

      return url;
    },
    [conversationId, message.sId, owner.sId, shouldStream]
  );

  const onEventCallback = useCallback((eventStr: string) => {
    const eventPayload: {
      eventId: string;
      data:
        | AgentErrorEvent
        | AgentActionSpecificEvent
        | AgentActionSuccessEvent
        | GenerationTokensEvent
        | AgentGenerationSuccessEvent
        | AgentGenerationCancelledEvent
        | AgentMessageSuccessEvent
        | AgentChainOfThoughtEvent;
    } = JSON.parse(eventStr);

    const updateMessageWithAction = (
      m: AgentMessageType,
      action: AgentActionType
    ): AgentMessageType => {
      return {
        ...m,
        actions: m.actions
          ? [...m.actions.filter((a) => a.id !== action.id), action]
          : [action],
      };
    };

    const event = eventPayload.data;
    switch (event.type) {
      case "agent_action_success":
        setStreamedAgentMessage((m) => {
          return { ...updateMessageWithAction(m, event.action), content: "" };
        });
        break;
      case "retrieval_params":
      case "dust_app_run_params":
      case "dust_app_run_block":
      case "tables_query_params":
      case "tables_query_output":
      case "process_params":
      case "websearch_params":
      case "browse_params":
        setStreamedAgentMessage((m) => {
          return updateMessageWithAction(m, event.action);
        });
        break;
      case "agent_error":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "failed", error: event.error };
        });
        break;

      case "agent_generation_success":
        setStreamedAgentMessage((m) => {
          return { ...m, content: event.text };
        });
        break;

      case "agent_chain_of_thought":
        setStreamedAgentMessage((m) => {
          return {
            ...m,
            chainOfThoughts: [...m.chainOfThoughts, event.chainOfThought],
          };
        });
        break;

      case "agent_generation_cancelled":
        setStreamedAgentMessage((m) => {
          return { ...m, status: "cancelled" };
        });
        break;

      case "agent_message_success": {
        setStreamedAgentMessage((m) => {
          return {
            ...m,
            ...event.message,
          };
        });
        break;
      }

      case "generation_tokens": {
        switch (event.classification) {
          case "closing_delimiter":
          case "opening_delimiter":
            break;
          case "tokens":
            setLastTokenClassification("tokens");
            setStreamedAgentMessage((m) => {
              const previousContent = m.content || "";
              return { ...m, content: previousContent + event.text };
            });
            break;
          case "chain_of_thought":
            setLastTokenClassification("chain_of_thought");
            setStreamedAgentMessage((m) => {
              const currentChainOfThoughts = m.chainOfThoughts;
              const lastChainOfThought = currentChainOfThoughts.pop() ?? "";
              const chainOfThoughts = [
                ...currentChainOfThoughts,
                lastChainOfThought + event.text,
              ];
              return { ...m, chainOfThoughts };
            });
            break;
          default:
            assertNever(event.classification);
        }
        break;
      }

      default:
        assertNever(event);
    }
  }, []);

  useEventSource(buildEventSourceURL, onEventCallback);

  const agentMessageToRender = ((): AgentMessageType => {
    switch (message.status) {
      case "succeeded":
      case "failed":
        return message;
      case "cancelled":
        if (streamedAgentMessage.status === "created") {
          return { ...streamedAgentMessage, status: "cancelled" };
        }
        return message;
      case "created":
        return streamedAgentMessage;
      default:
        assertNever(message.status);
    }
  })();

  // Autoscroll is performed when a message is generating and the page is
  // already scrolled down; but if the user has scrolled the page up after the
  // start of the message, we do not want to scroll it back down.
  //
  // Checking the conversation is already at the bottom of the screen is done
  // modulo a small margin (50px). This value is small because if large, it
  // prevents user from scrolling up when the message continues generating
  // (forces it back down), but it cannot be zero otherwise the scroll does not
  // happen.
  const isAtBottom = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        isAtBottom.current = entry.isIntersecting;
      },
      { threshold: 1 }
    );

    const currentBottomRef = bottomRef.current;

    if (currentBottomRef) {
      observer.observe(currentBottomRef);
    }

    return () => {
      if (currentBottomRef) {
        observer.unobserve(currentBottomRef);
      }
    };
  }, []);

  useEffect(() => {
    const mainTag = document.getElementById(
      CONVERSATION_PARENT_SCROLL_DIV_ID[isInModal ? "modal" : "page"]
    );
    if (
      mainTag &&
      streamedAgentMessage.status === "created" &&
      isAtBottom.current
    ) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [
    agentMessageToRender.content,
    agentMessageToRender.status,
    agentMessageToRender.actions.length,
    streamedAgentMessage.status,
    activeReferences.length,
    isInModal,
  ]);

  // GenerationContext: to know if we are generating or not
  const generationContext = useContext(GenerationContext);
  if (!generationContext) {
    throw new Error(
      "AgentMessage must be used within a GenerationContextProvider"
    );
  }
  useEffect(() => {
    const isInArray = generationContext.generatingMessages.some(
      (m) => m.messageId === message.sId
    );
    if (agentMessageToRender.status === "created" && !isInArray) {
      generationContext.setGeneratingMessages((s) => [
        ...s,
        { messageId: message.sId, conversationId },
      ]);
    } else if (agentMessageToRender.status !== "created" && isInArray) {
      generationContext.setGeneratingMessages((s) =>
        s.filter((m) => m.messageId !== message.sId)
      );
    }
  }, [
    agentMessageToRender.status,
    generationContext,
    message.sId,
    conversationId,
  ]);

  const buttons =
    message.status === "failed"
      ? []
      : [
          {
            label: "Copy to clipboard",
            icon: ClipboardIcon,
            onClick: () => {
              void navigator.clipboard.writeText(
                cleanUpCitations(agentMessageToRender.content || "")
              );
            },
          },
          {
            label: "Retry",
            icon: ArrowPathIcon,
            onClick: () => {
              void retryHandler(agentMessageToRender);
            },
            disabled: isRetryHandlerProcessing || shouldStream,
          },
        ];

  function updateActiveReferences(
    document: RetrievalDocumentType,
    index: number
  ) {
    const existingIndex = activeReferences.find((r) => r.index === index);
    if (!existingIndex) {
      setActiveReferences([...activeReferences, { index, document }]);
    }
  }

  const [lastHoveredReference, setLastHoveredReference] = useState<
    number | null
  >(null);
  useEffect(() => {
    const retrievalActionsWithDocs = agentMessageToRender.actions
      .filter((a) => isRetrievalActionType(a) && a.documents)
      .sort((a, b) => a.id - b.id) as RetrievalActionType[];

    const allDocs = removeNulls(
      retrievalActionsWithDocs.map((a) => a.documents).flat()
    );

    setReferences(
      allDocs.reduce((acc, d) => {
        acc[d.reference] = d;
        return acc;
      }, {} as { [key: string]: RetrievalDocumentType })
    );
  }, [
    agentMessageToRender.actions,
    agentMessageToRender.status,
    agentMessageToRender.sId,
  ]);

  const { configuration: agentConfiguration } = agentMessageToRender;

  return (
    <ConversationMessage
      owner={owner}
      user={user}
      conversationId={conversationId}
      messageId={agentMessageToRender.sId}
      pictureUrl={agentConfiguration.pictureUrl}
      name={`@${agentConfiguration.name}`}
      buttons={buttons}
      avatarBusy={agentMessageToRender.status === "created"}
      reactions={reactions}
      enableEmojis={!hideReactions}
      renderName={() => {
        return (
          <div className="flex flex-row gap-2">
            <div className="text-base font-medium">
              {AssitantDetailViewLink(agentConfiguration)}
            </div>
            <AssistantEditionMenu
              agentConfigurationId={agentConfiguration.sId}
              owner={owner}
              showAddRemoveToList
            />
          </div>
        );
      }}
      type="agent"
      size={size}
    >
      <div>
        {renderAgentMessage({
          agentMessage: agentMessageToRender,
          references: references,
          streaming: shouldStream,
          lastTokenClassification: lastTokenClassification,
        })}
      </div>
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </ConversationMessage>
  );

  function renderAgentMessage({
    agentMessage,
    references,
    streaming,
    lastTokenClassification,
  }: {
    agentMessage: AgentMessageType;
    references: { [key: string]: RetrievalDocumentType };
    streaming: boolean;
    lastTokenClassification: null | "tokens" | "chain_of_thought";
  }) {
    if (agentMessage.status === "failed") {
      return (
        <ErrorMessage
          error={
            agentMessage.error || {
              message: "Unexpected Error",
              code: "unexpected_error",
            }
          }
          retryHandler={async () => retryHandler(agentMessage)}
        />
      );
    }

    // TODO(2024-05-27 flav) Use <ConversationMessage.citations />.

    const chainOfThought = agentMessage.chainOfThoughts.join("");
    return (
      <div className="flex flex-col gap-y-4">
        <AgentMessageActions agentMessage={agentMessage} size={size} />

        {chainOfThought.length ? (
          <div className="flex w-full flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-sm text-slate-800">
            <div className="flex flex-row gap-2">
              <Icon size="sm" visual={PuzzleIcon} />
              <div className="font-semibold">Assistant thoughts</div>
            </div>

            <div className="italic">
              <RenderMessageMarkdown
                content={chainOfThought}
                isStreaming={false}
              />
            </div>
          </div>
        ) : null}

        {agentMessage.content !== null && (
          <div>
            {lastTokenClassification !== "chain_of_thought" &&
            agentMessage.content === "" ? (
              <div className="blinking-cursor">
                <span></span>
              </div>
            ) : (
              <>
                <RenderMessageMarkdown
                  content={agentMessage.content}
                  isStreaming={
                    streaming && lastTokenClassification === "tokens"
                  }
                  citationsContext={{
                    references,
                    updateActiveReferences,
                    setHoveredReference: setLastHoveredReference,
                  }}
                />
                {activeReferences.length > 0 && (
                  <Citations
                    activeReferences={activeReferences}
                    lastHoveredReference={lastHoveredReference}
                  />
                )}
              </>
            )}
          </div>
        )}
        {agentMessage.status === "cancelled" && (
          <Chip
            label="Message generation was interrupted"
            size="xs"
            className="mt-4"
          />
        )}
      </div>
    );
  }

  async function retryHandler(agentMessage: AgentMessageType) {
    setIsRetryHandlerProcessing(true);
    await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${agentMessage.sId}/retry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    setIsRetryHandlerProcessing(false);
  }
}

function AssitantDetailViewLink(assistant: LightAgentConfigurationType) {
  const router = useRouter();
  const href = {
    pathname: router.pathname,
    query: { ...router.query, assistantDetails: assistant.sId },
  };

  return (
    <Link
      href={href}
      shallow
      className="cursor-pointer duration-300 hover:text-action-500 active:text-action-600"
    >
      @{assistant.name}
    </Link>
  );
}

function Citations({
  activeReferences,
  lastHoveredReference,
}: {
  activeReferences: { index: number; document: RetrievalDocumentType }[];
  lastHoveredReference: number | null;
}) {
  activeReferences.sort((a, b) => a.index - b.index);
  return (
    <div
      className="grid grid-cols-3 items-stretch gap-2 pb-4 pt-8 md:grid-cols-4"
      // ref={citationContainer}
    >
      {activeReferences.map(({ document, index }) => {
        const [documentCitation] = makeDocumentCitations([document]);

        return (
          <Citation
            key={index}
            size="xs"
            sizing="fluid"
            isBlinking={lastHoveredReference === index}
            type={documentCitation.provider}
            title={documentCitation.title}
            href={documentCitation.link}
            index={index}
          />
        );
      })}
    </div>
  );
}

function ErrorMessage({
  error,
  retryHandler,
}: {
  error: { code: string; message: string };
  retryHandler: () => void;
}) {
  const fullMessage =
    "ERROR: " + error.message + (error.code ? ` (code: ${error.code})` : "");

  const { submit: retry, isSubmitting: isRetrying } = useSubmitFunction(
    async () => retryHandler()
  );

  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-1 sm:flex-row">
        <Chip
          color="warning"
          label={"ERROR: " + shortText(error.message)}
          size="xs"
        />
        <DropdownMenu>
          <DropdownMenu.Button>
            <Button
              variant="tertiary"
              size="xs"
              icon={EyeIcon}
              label="See the error"
            />
          </DropdownMenu.Button>
          <div className="relative bottom-6 z-30">
            <DropdownMenu.Items origin="topLeft" width={320}>
              <div className="flex flex-col gap-3 px-4 pb-3 pt-5">
                <div className="text-sm font-normal text-warning-800">
                  {fullMessage}
                </div>
                <div className="self-end">
                  <Button
                    variant="tertiary"
                    size="xs"
                    icon={DocumentDuplicateIcon}
                    label={"Copy"}
                    onClick={() =>
                      void navigator.clipboard.writeText(fullMessage)
                    }
                  />
                </div>
              </div>
            </DropdownMenu.Items>
          </div>
        </DropdownMenu>
      </div>
      <div>
        <Button
          variant="tertiary"
          size="sm"
          icon={ArrowPathIcon}
          label="Retry"
          onClick={retry}
          disabled={isRetrying}
        />
      </div>
    </div>
  );
}

function shortText(text: string, maxLength = 30) {
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}
