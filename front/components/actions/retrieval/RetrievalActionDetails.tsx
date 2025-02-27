import {
  Chip,
  Citation,
  Collapsible,
  MagnifyingGlassIcon,
  Page,
  Tooltip,
} from "@dust-tt/sparkle";
import type {
  RetrievalActionType,
  RetrievalDocumentType,
} from "@dust-tt/types";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import { makeDocumentCitations } from "@app/components/actions/retrieval/utils";
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";

export function RetrievalActionDetails({
  action,
  defaultOpen,
}: ActionDetailsComponentBaseProps<RetrievalActionType>) {
  return (
    <ActionDetailsWrapper
      actionName="Search data"
      defaultOpen={defaultOpen}
      visual={MagnifyingGlassIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-900">Query</span>
          <div className="text-sm font-normal text-slate-500">
            <RetrievalActionQuery action={action} />
          </div>
        </div>
        <div>
          <Collapsible defaultOpen={defaultOpen}>
            <Collapsible.Button>
              <span className="text-sm font-bold text-slate-900">Results</span>
            </Collapsible.Button>
            <Collapsible.Panel>
              <RetrievedDocumentsGrid
                documents={action.documents ?? undefined}
              />
            </Collapsible.Panel>
          </Collapsible>
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}

function RetrievalActionQuery({ action }: { action: RetrievalActionType }) {
  const { documents, params } = action;
  const { query, topK } = params;

  // Check if the number of chunks reached the limit defined in params.topK.
  const tooManyChunks =
    documents &&
    documents.reduce((sum, doc) => sum + doc.chunks.length, 0) >= topK &&
    !query;

  // Determine the retrieval date limit from the last document's timestamp.
  const retrievalTsLimit = documents?.[documents.length - 1]?.timestamp;
  const date = retrievalTsLimit ? new Date(retrievalTsLimit) : null;
  const retrievalDateLimitAsString = date
    ? `${date.toLocaleString("default", { month: "short" })} ${date.getDate()}`
    : null;

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-normal text-slate-500">
        {makeQueryDescription(action)}
      </p>
      {tooManyChunks && (
        <Tooltip
          label={`Too much data to retrieve! Retrieved ${topK} excerpts from ${documents?.length} recent docs, up to ${retrievalDateLimitAsString}.`}
        >
          <Chip
            color="warning"
            label={`Limited retrieval (from now to ${retrievalDateLimitAsString})`}
          />
        </Tooltip>
      )}
    </div>
  );
}

function makeQueryDescription(action: RetrievalActionType) {
  const { query, relativeTimeFrame } = action.params;

  const timeFrameAsString = relativeTimeFrame
    ? "over the last " +
      (relativeTimeFrame.duration > 1
        ? `${relativeTimeFrame.duration} ${relativeTimeFrame.unit}s`
        : `${relativeTimeFrame.unit}`)
    : "across all time periods";

  if (!query) {
    return `Searching ${timeFrameAsString}.`;
  }

  return `Searching "${query}", ${timeFrameAsString}.`;
}

function RetrievedDocumentsGrid({
  documents,
}: {
  documents?: RetrievalDocumentType[];
}) {
  if (!documents) {
    return null;
  }

  const documentCitations = makeDocumentCitations(documents);
  return (
    <>
      <Page.Separator />
      <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto overflow-x-hidden py-1">
        {documentCitations.map((d, idx) => {
          return (
            <Citation
              size="xs"
              sizing="fluid"
              key={idx}
              title={d.title}
              type={d.provider}
              href={d.link}
            />
          );
        })}
      </div>
      <Page.Separator />
    </>
  );
}
