import {
  Button,
  ChevronDownIcon,
  Chip,
  ClipboardCheckIcon,
  Dialog,
  DropdownMenu,
  DustIcon,
  IconButton,
  LinkIcon,
  LockIcon,
  PlanetIcon,
  ShapesIcon,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import type {
  AgentConfigurationScope,
  AgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { isBuilder } from "@dust-tt/types";
import { useState } from "react";

import { assistantUsageMessage } from "@app/components/assistant/Usage";
import { useAgentConfiguration, useAgentUsage } from "@app/lib/swr";

type ConfirmationModalDataType = {
  title: string;
  text: string;
  confirmText: string;
  showUsage?: boolean;
  variant: "primary" | "primaryWarning";
};

export const SCOPE_INFO: Record<
  AgentConfigurationScope,
  {
    shortLabel: string;
    label: string;
    color: "pink" | "amber" | "sky" | "slate";
    icon: typeof UserGroupIcon | typeof PlanetIcon | typeof LockIcon;
    text: string;
    confirmationModalData: ConfirmationModalDataType | null;
  }
> = {
  published: {
    shortLabel: "Shared",
    label: "Shared Assistant",
    color: "pink",
    icon: UserGroupIcon,
    text: "Anyone in the workspace can view and edit.",
    confirmationModalData: {
      title: "Moving to Shared Assistants",
      text: "The assistant is editable and viewable by all workspace members.",
      confirmText: "Move to Shared",
      variant: "primary",
    },
  },
  workspace: {
    shortLabel: "Company",
    label: "Company Assistant",
    color: "amber",
    icon: PlanetIcon,
    text: "Activated by default for all members of the workspace.",
    confirmationModalData: {
      title: "Moving to Company Assistants",
      text: "The assistant automatically appears in every member's 'My Assistants' list. It's editable by Admins and Builders only.",
      confirmText: "Move to Company",
      variant: "primary",
    },
  },
  private: {
    shortLabel: "Personal",
    label: "Personal Assistant",
    color: "sky",
    icon: LockIcon,
    text: "Only I can view and edit.",
    confirmationModalData: {
      title: "Moving to Personal Assistants",
      text: `The assistant is only editable, viewable and usable by you.`,
      confirmText: "Move to Personal",
      variant: "primaryWarning",
      showUsage: true,
    },
  },
  global: {
    shortLabel: "Default",
    label: "Default Assistant",
    color: "slate",
    icon: DustIcon,
    text: "Default assistants provided by Dust.",
    confirmationModalData: null,
  },
} as const;

type NonGlobalScope = Exclude<AgentConfigurationScope, "global">;

export function SharingButton({
  owner,
  agentConfigurationId,
  initialScope,
  newScope,
  setNewScope,
  baseUrl,
}: {
  owner: WorkspaceType;
  agentConfigurationId: string | null;
  initialScope: NonGlobalScope;
  newScope: NonGlobalScope;
  setNewScope: (scope: NonGlobalScope) => void;
  baseUrl: string;
}) {
  const { agentUsage, isAgentUsageLoading, isAgentUsageError } = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const { agentConfiguration } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId,
  });
  const assistantName = agentConfiguration?.name;

  const usageText = assistantName
    ? assistantUsageMessage({
        assistantName: null,
        usage: agentUsage,
        isLoading: isAgentUsageLoading,
        isError: isAgentUsageError,
        boldVersion: true,
      })
    : "";

  const shareLink = `${baseUrl}/w/${owner.sId}/assistant/gallery?assistantDetails=${agentConfigurationId}`;
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);

  return (
    <DropdownMenu>
      <DropdownMenu.Button>
        <Button
          size="sm"
          label="Sharing"
          icon={ShapesIcon}
          variant="tertiary"
        />
      </DropdownMenu.Button>
      <DropdownMenu.Items width={319} overflow="visible">
        <div className="-mx-1 flex flex-col gap-y-4 pb-2 pt-3">
          <div className="flex flex-col gap-y-2">
            <SharingDropdown
              owner={owner}
              agentConfiguration={agentConfiguration}
              initialScope={initialScope}
              newScope={newScope}
              setNewScope={setNewScope}
            />
            <div className="text-sm text-element-700">
              <div>
                {SCOPE_INFO[newScope].text}{" "}
                {agentUsage &&
                agentUsage.usersWithAgentInListCount > 0 &&
                newScope !== "private"
                  ? usageText
                  : null}
              </div>
            </div>
          </div>
          {agentConfigurationId && (
            <div className="flex flex-row justify-between">
              <div>
                <div className="text-base font-bold text-element-800">Link</div>
                <div className="text-sm text-element-700">
                  Shareable direct URL
                </div>
              </div>
              <div>
                <Button
                  size="sm"
                  icon={copyLinkSuccess ? ClipboardCheckIcon : LinkIcon}
                  label={copyLinkSuccess ? "Copied!" : "Copy link"}
                  variant="secondary"
                  className="w-full"
                  onClick={async () => {
                    await navigator.clipboard.writeText(shareLink);
                    setCopyLinkSuccess(true);
                    setTimeout(() => {
                      setCopyLinkSuccess(false);
                    }, 1000);
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

/*
 * Note: Non-builders cannot change to/from company assistant
 */
export function SharingDropdown({
  owner,
  agentConfiguration,
  disabled,
  initialScope,
  newScope,
  setNewScope,
}: {
  owner: WorkspaceType;
  agentConfiguration: AgentConfigurationType | null;
  disabled?: boolean;
  initialScope: AgentConfigurationScope;
  newScope: AgentConfigurationScope;
  setNewScope: (scope: NonGlobalScope) => void;
}) {
  const [requestNewScope, setModalNewScope] = useState<NonGlobalScope | null>(
    null
  );

  const agentUsage = useAgentUsage({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration?.sId || null,
  });
  const assistantInMyList = agentConfiguration?.userListStatus === "in-list";
  const assistantName = agentConfiguration?.name;

  const usageText = assistantName
    ? assistantUsageMessage({
        assistantName,
        usage: agentUsage.agentUsage,
        isLoading: agentUsage.isAgentUsageLoading,
        isError: agentUsage.isAgentUsageError,
        boldVersion: true,
      })
    : "";

  // special case if changing setting from company to shared
  const companyToSharedModalData: ConfirmationModalDataType = {
    title: "Moving to Shared Assistants",
    text: `${
      assistantName || "Assistant"
    } will be editable by all members; it won't automatically appear in workspace member's 'My Assistants' list.`,
    confirmText: "Move to Shared",
    variant: "primary",
    showUsage: true,
  };

  let confirmationModalData: ConfirmationModalDataType | null = {
    title: "",
    text: "",
    confirmText: "",
    variant: "primary",
  };

  if (requestNewScope) {
    confirmationModalData =
      requestNewScope === "published" && initialScope === "workspace"
        ? companyToSharedModalData
        : SCOPE_INFO[requestNewScope].confirmationModalData;
  }

  const allowedToChange =
    !disabled &&
    // never change global assistant
    initialScope !== "global" &&
    // only builders can change company assistants
    (isBuilder(owner) || initialScope !== "workspace");

  return (
    <div>
      {requestNewScope && confirmationModalData && (
        <ScopeChangeModal
          show={requestNewScope !== null}
          confirmationModalData={confirmationModalData}
          usageText={confirmationModalData.showUsage ? usageText : undefined}
          onClose={() => setModalNewScope(null)}
          setSharingScope={() =>
            requestNewScope && setNewScope(requestNewScope)
          }
        />
      )}
      <DropdownMenu>
        <DropdownMenu.Button disabled={!allowedToChange}>
          <div className="group flex cursor-pointer items-center gap-2">
            <SharingChip scope={newScope} />
            {allowedToChange && (
              <IconButton
                icon={ChevronDownIcon}
                size="sm"
                variant="secondary"
                className="group-hover:text-action-400"
              />
            )}
          </div>
        </DropdownMenu.Button>
        <DropdownMenu.Items origin="topRight" width={200}>
          {Object.entries(SCOPE_INFO)
            .filter(
              // can't change to those scopes
              ([entryScope]) =>
                entryScope !== "global" &&
                (isBuilder(owner) || entryScope !== "workspace")
            )
            .map(([entryScope, entryData]) => (
              <DropdownMenu.Item
                key={entryData.label}
                label={entryData.label}
                icon={entryData.icon}
                selected={entryScope === newScope}
                onClick={() => {
                  // no need for modal in the following cases
                  if (
                    // assistant is being created
                    !agentConfiguration ||
                    // selection unchanged
                    entryScope === newScope ||
                    // selection back to initial state
                    entryScope === initialScope ||
                    // the only user of the assistant is the user changing the scope
                    ((entryScope === "private" || entryScope === "company") &&
                      assistantInMyList &&
                      (!agentUsage.agentUsage ||
                        agentUsage.agentUsage.userCount === 1))
                  ) {
                    setNewScope(entryScope as NonGlobalScope);
                    return;
                  }
                  // in all other cases, show modal
                  setModalNewScope(entryScope as NonGlobalScope);
                }}
              />
            ))}
        </DropdownMenu.Items>
      </DropdownMenu>
    </div>
  );
}

export function SharingChip({ scope }: { scope: AgentConfigurationScope }) {
  return (
    <Chip color={SCOPE_INFO[scope].color} icon={SCOPE_INFO[scope].icon}>
      {SCOPE_INFO[scope].label}
    </Chip>
  );
}

function ScopeChangeModal({
  show,
  confirmationModalData,
  usageText,
  onClose,
  setSharingScope,
}: {
  show: boolean;
  confirmationModalData: ConfirmationModalDataType;
  usageText?: React.ReactNode;
  onClose: () => void;
  setSharingScope: () => void;
}) {
  return (
    <Dialog
      isOpen={show}
      title={confirmationModalData.title}
      onCancel={onClose}
      validateLabel={confirmationModalData.confirmText}
      validateVariant={confirmationModalData.variant}
      onValidate={async () => {
        setSharingScope();
        onClose();
      }}
    >
      <div>
        <div className="pb-2">
          {usageText && <span className="font-bold">{usageText + " "}</span>}
          {confirmationModalData.text}
        </div>
        <div className="font-bold">Are you sure you want to proceed ?</div>
      </div>
    </Dialog>
  );
}
