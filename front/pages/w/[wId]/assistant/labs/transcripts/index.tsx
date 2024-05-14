import {
  BookOpenIcon,
  Button,
  CloudArrowLeftRightIcon,
  Input,
  Page,
  SliderToggle,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LabsTranscriptsProviderType,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { LightAgentConfigurationType } from "@dust-tt/types";
import Nango from "@nangohq/frontend";
import type { InferGetServerSidePropsType } from "next";
import { useContext, useEffect, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import { AssistantSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import AppLayout from "@app/components/sparkle/AppLayout";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import apiConfig from "@app/lib/api/config";
import { buildConnectionId } from "@app/lib/connector_connection_id";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import config from "@app/lib/labs/config";
import {
  useAgentConfigurations,
  useLabsTranscriptsConfiguration,
} from "@app/lib/swr";
import type { PatchTranscriptsConfiguration } from "@app/pages/api/w/[wId]/labs/transcripts/[tId]";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  gaTrackingId: string;
  nangoDriveConnectorId: string;
  nangoPublicKey: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (
    !owner ||
    !owner.flags.includes("labs_transcripts") ||
    !subscription ||
    !user
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      user,
      subscription,
      gaTrackingId: apiConfig.getGaTrackingId(),
      nangoDriveConnectorId: config.getNangoGoogleDriveConnectorId(),
      nangoPublicKey: config.getNangoPublicKey(),
    },
  };
});

export default function LabsTranscriptsIndex({
  owner,
  user,
  subscription,
  gaTrackingId,
  nangoDriveConnectorId,
  nangoPublicKey,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const sendNotification = useContext(SendNotificationsContext);

  const { agentConfigurations } = useAgentConfigurations({
    workspaceId: owner.sId,
    agentsGetView: "list",
    sort: "priority",
  });

  const {
    transcriptsConfiguration,
    isTranscriptsConfigurationLoading,
    mutateTranscriptsConfiguration,
  } = useLabsTranscriptsConfiguration({ workspaceId: owner.sId });

  const [transcriptsConfigurationState, setTranscriptsConfigurationState] =
    useState<{
      provider: string;
      isGDriveConnected: boolean;
      isGongConnected: boolean;
      assistantSelected: LightAgentConfigurationType | null;
      isActive: boolean;
      gongApiKey: string;
      gongApiSecret: string;
    }>({
      provider: "",
      isGDriveConnected: false,
      isGongConnected: false,
      assistantSelected: null as LightAgentConfigurationType | null,
      isActive: false,
      gongApiKey: "",
      gongApiSecret: "",
    });

  useEffect(() => {
    if (transcriptsConfiguration) {
      setTranscriptsConfigurationState({
        ...transcriptsConfigurationState,
        provider: transcriptsConfiguration.provider || "",
        isGongConnected: transcriptsConfiguration.provider == "gong" || false,
        isGDriveConnected:
          transcriptsConfiguration.provider == "google_drive" || false,
        assistantSelected:
          agentConfigurations.find(
            (a) => a.sId === transcriptsConfiguration.agentConfigurationId
          ) || null,
        isActive: transcriptsConfiguration.isActive || false,
      });
    }
  }, [transcriptsConfiguration, agentConfigurations]);

  if (isTranscriptsConfigurationLoading) {
    return <Spinner />;
  }

  const agents = agentConfigurations.filter((a) => a.status === "active");

  const handleProviderChange = async (
    provider: LabsTranscriptsProviderType
  ) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      provider,
    });
    await mutateTranscriptsConfiguration();
  };

  const handleGongApiKeyChange = async (gongApiKey: string) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      gongApiKey,
    });
  };

  const handleGongApiSecretChange = async (gongApiSecret: string) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      gongApiSecret,
    });
  }

  const handleDisconnectProvider = async (
    transcriptConfigurationId: number
  ) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to disconnect",
        description: "Could not disconnect the provider. Please try again.",
      });
    } else {
      window.location.reload();
    }
  };

  const makePatchRequest = async (
    transcriptConfigurationId: number,
    data: Partial<PatchTranscriptsConfiguration>,
    successMessage: string
  ) => {
    const response = await fetch(
      `/api/w/${owner.sId}/labs/transcripts/${transcriptConfigurationId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to update",
        description: "Could not update the configuration. Please try again.",
      });
      return;
    }

    sendNotification({
      type: "success",
      title: "Success!",
      description: successMessage,
    });

    await mutateTranscriptsConfiguration();
  };

  const updateAssistant = async (
    transcriptsConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      assistantSelected: assistant,
    });

    const successMessage =
      "The assistant that will help you summarize your transcripts has been set to @" +
      assistant.name;
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        agentConfigurationId: assistant.sId,
      },
      successMessage
    );
  };

  const updateIsActive = async (
    transcriptsConfigurationId: number,
    isActive: boolean
  ) => {
    setTranscriptsConfigurationState({
      ...transcriptsConfigurationState,
      isActive,
    });

    const successMessage = isActive
      ? "We will start summarizing your meeting transcripts."
      : "We will no longer summarize your meeting transcripts.";
    await makePatchRequest(
      transcriptsConfigurationId,
      {
        isActive,
      },
      successMessage
    );
  };

  const handleSelectAssistant = async (
    transcriptConfigurationId: number,
    assistant: LightAgentConfigurationType
  ) => {
    return updateAssistant(transcriptConfigurationId, assistant);
  };

  const handleSetIsActive = async (
    transcriptConfigurationId: number,
    isActive: boolean
  ) => {
    return updateIsActive(transcriptConfigurationId, isActive);
  };

  const saveGoogleDriveConnection = async (connectionId: string) => {
    const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        connectionId,
        gongApiKey: null,
        provider: transcriptsConfigurationState.provider,
      }),
    });

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Connected Google Drive",
        description: "Google Drive has been connected successfully.",
      });
      setTranscriptsConfigurationState({
        ...transcriptsConfigurationState,
        isGDriveConnected: true,
      });

      await mutateTranscriptsConfiguration();
    }

    return response;
  };

  const saveGongConnection = async () => {
    const response = await fetch(`/api/w/${owner.sId}/labs/transcripts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        gongApiKey: Buffer.from(`${transcriptsConfigurationState.gongApiKey}:${transcriptsConfigurationState.gongApiSecret}`).toString('base64'),
        connectionId: null,
        provider: "gong",
      }),
    });

    if (!response.ok) {
      sendNotification({
        type: "error",
        title: "Failed to connect Gong",
        description: "Could not connect to Gong. Please try again.",
      });
    } else {
      sendNotification({
        type: "success",
        title: "Connected Gong",
        description: "Gong has been connected successfully.",
      });
      setTranscriptsConfigurationState({
        ...transcriptsConfigurationState,
        isGongConnected: true,
      });

      await mutateTranscriptsConfiguration();
    }

    return response;
  };

  const handleConnectGoogleTranscriptsSource = async () => {
    try {
      if (transcriptsConfigurationState.provider !== "google_drive") {
        return;
      }
      const nango = new Nango({ publicKey: nangoPublicKey });
      const newConnectionId = buildConnectionId(
        `labs-transcripts-workspace-${owner.id}-user-${user.id}`,
        transcriptsConfigurationState.provider
      );
      const {
        connectionId: nangoConnectionId,
      }: { providerConfigKey: string; connectionId: string } = await nango.auth(
        nangoDriveConnectorId,
        newConnectionId
      );

      await saveGoogleDriveConnection(nangoConnectionId);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to connect Google Drive",
        description: "Could not connect to Google Drive. Please try again.",
      });
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="conversations"
      pageTitle="Dust - Transcripts processing"
      navChildren={<AssistantSidebarMenu owner={owner} />}
    >
      <Page>
        <Page.Header
          title="Transcripts processing"
          icon={BookOpenIcon}
          description="Receive meeting minutes summarized by email automatically."
        />
        <Page.Layout direction="vertical">
          <Page.SectionHeader title="1. Connect your transcripts provider" />
          {!transcriptsConfiguration && (
            <Page.Layout direction="horizontal" gap="xl">
              <div
                className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                  transcriptsConfigurationState.provider == "google_drive"
                    ? "border-gray-400"
                    : "border-gray-200"
                }`}
                onClick={() => handleProviderChange("google_drive")}
              >
                <img
                  src="/static/labs/transcripts/google.png"
                  style={{ maxHeight: "35px" }}
                />
              </div>
              <div
                className={`cursor-pointer rounded-md border p-4 hover:border-gray-400 ${
                  transcriptsConfigurationState.provider == "gong"
                    ? "border-gray-400"
                    : "border-gray-200"
                }`}
                onClick={() =>
                  owner.flags.includes("labs_transcripts_gong")
                    ? handleProviderChange("gong")
                    : sendNotification({
                        type: "error",
                        title: "Gong is coming soon",
                        description:
                          "We're working on adding Gong support. Contact us if you'd like to be notified when it's available.",
                      })
                }
              >
                <img
                  src="/static/labs/transcripts/gong.jpeg"
                  style={{ maxHeight: "35px" }}
                />
              </div>
            </Page.Layout>
          )}

          {transcriptsConfigurationState.provider === "google_drive" && (
            <Page.Layout direction="vertical">
              <Page.P>
                Connect to Google Drive so Dust can access 'My Drive' where your
                meeting transcripts are stored.
              </Page.P>
              <div>
                <Button
                  label={
                    transcriptsConfigurationState.isGDriveConnected
                      ? "Connected"
                      : "Connect"
                  }
                  size="sm"
                  icon={CloudArrowLeftRightIcon}
                  disabled={transcriptsConfigurationState?.isGDriveConnected}
                  onClick={async () => {
                    await handleConnectGoogleTranscriptsSource();
                  }}
                />
              </div>
            </Page.Layout>
          )}
          {transcriptsConfigurationState.provider === "gong" && (
            <Page.Layout direction="vertical">
              <Page.P>
                Add your Gong API key so Dust can access your Gong account and
                process your transcripts.
              </Page.P>
              {transcriptsConfiguration &&
              transcriptsConfigurationState.isGongConnected ? (
                <Page.Layout direction="horizontal">
                  <Button
                    label={"Gong API is connected"}
                    size="sm"
                    icon={CloudArrowLeftRightIcon}
                    disabled={true}
                  />
                  {/* disconnect button */}
                  <Button
                    label={"Disconnect"}
                    size="sm"
                    variant="secondaryWarning"
                    onClick={async () => {
                      await handleDisconnectProvider(
                        transcriptsConfiguration.id
                      );
                    }}
                  />
                </Page.Layout>
              ) : (
                <Page.Layout direction="horizontal">
                  <Input
                    placeholder="Gong Access key"
                    name="gongApiKey"
                    onChange={(e) => handleGongApiKeyChange(e)}
                    value={transcriptsConfigurationState.gongApiKey}
                  />
                   <Input
                    placeholder="Gong Access secret"
                    name="gongApiKey"
                    onChange={(e) => handleGongApiSecretChange(e)}
                    value={transcriptsConfigurationState.gongApiSecret}
                  />
                  <Button
                    label={"Save"}
                    size="sm"
                    disabled={
                      transcriptsConfigurationState.gongApiKey.length != 32 ||
                      transcriptsConfigurationState.gongApiSecret.length < 30
                    }
                    onClick={async () => {
                      await saveGongConnection();
                    }}
                  />
                </Page.Layout>
              )}
            </Page.Layout>
          )}
        </Page.Layout>
        {transcriptsConfiguration &&
          (transcriptsConfigurationState.isGDriveConnected ||
            transcriptsConfigurationState.isGongConnected) && (
            <>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="2. Choose an assistant" />
                <Page.Layout direction="vertical">
                  <Page.P>
                    Choose the assistant that will summarize the transcripts in
                    the way you want.
                  </Page.P>
                  <Page.Layout direction="horizontal">
                    <AssistantPicker
                      owner={owner}
                      size="sm"
                      onItemClick={(assistant) =>
                        handleSelectAssistant(
                          transcriptsConfiguration.id,
                          assistant
                        )
                      }
                      assistants={agents}
                      showFooterButtons={false}
                    />
                    {transcriptsConfigurationState.assistantSelected && (
                      <Page.P>
                        <strong>
                          @
                          {transcriptsConfigurationState.assistantSelected.name}
                        </strong>
                      </Page.P>
                    )}
                  </Page.Layout>
                </Page.Layout>
              </Page.Layout>
              <Page.Layout direction="vertical">
                <Page.SectionHeader title="3. Enable transcripts processing" />
                <Page.Layout direction="horizontal" gap="xl">
                  <SliderToggle
                    selected={transcriptsConfigurationState.isActive}
                    onClick={() =>
                      handleSetIsActive(
                        transcriptsConfiguration.id,
                        !transcriptsConfigurationState.isActive
                      )
                    }
                    disabled={!transcriptsConfigurationState.assistantSelected}
                  />
                  <Page.P>
                    When enabled, each new meeting transcript in 'My Drive' will
                    be processed.
                    <br />
                    Summaries can take up to 30 minutes to be sent after
                    meetings end.
                  </Page.P>
                </Page.Layout>
              </Page.Layout>
            </>
          )}
      </Page>
    </AppLayout>
  );
}
