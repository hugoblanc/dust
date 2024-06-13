import {
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  Tree,
} from "@dust-tt/sparkle";
import type {
  ContentNode,
  ContentNodesViewType,
  DataSourceType,
  WorkspaceType,
} from "@dust-tt/types";
import type { ConnectorPermission, ContentNodeType } from "@dust-tt/types";
import { CircleStackIcon, FolderIcon } from "@heroicons/react/20/solid";
import { useEffect, useState } from "react";

import { useConnectorPermissions } from "@app/lib/swr";

export default function DataSourceResourceSelectorTree({
  owner,
  dataSource,
  showExpand, //if not, it's flat
  parentIsSelected,
  selectedParents,
  selectedResourceIds,
  onSelectChange,
  fullySelected,
  filterPermission = "read",
  viewType = "documents",
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  showExpand: boolean;
  parentIsSelected?: boolean;
  selectedParents: string[];
  selectedResourceIds: string[];
  onSelectChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  fullySelected: boolean;
  filterPermission?: ConnectorPermission;
  viewType?: ContentNodesViewType;
}) {
  return (
    <div className="overflow-x-auto">
      <DataSourceResourceSelectorChildren
        owner={owner}
        dataSource={dataSource}
        parentId={null}
        showExpand={showExpand}
        parents={[]}
        parentIsSelected={parentIsSelected}
        selectedResourceIds={selectedResourceIds}
        selectedParents={selectedParents}
        onSelectChange={(resource, parents, selected) => {
          onSelectChange(resource, parents, selected);
        }}
        fullySelected={fullySelected}
        filterPermission={filterPermission}
        viewType={viewType}
      />
    </div>
  );
}

export type IconComponentType =
  | typeof DocumentTextIcon
  | typeof FolderIcon
  | typeof CircleStackIcon
  | typeof ChatBubbleLeftRightIcon;

function getIconForType(type: ContentNodeType): IconComponentType {
  switch (type) {
    case "file":
      return DocumentTextIcon;
    case "folder":
      return FolderIcon;
    case "database":
      return CircleStackIcon;
    case "channel":
      return ChatBubbleLeftRightIcon;
    default:
      ((n: never) => {
        throw new Error("Unreachable " + n);
      })(type);
  }
}

function DataSourceResourceSelectorChildren({
  owner,
  dataSource,
  parentId,
  parents,
  parentIsSelected,
  selectedParents,
  showExpand,
  selectedResourceIds,
  onSelectChange,
  fullySelected,
  filterPermission,
  viewType = "documents",
}: {
  owner: WorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  parents: string[];
  parentIsSelected?: boolean;
  selectedParents: string[];
  showExpand: boolean;
  selectedResourceIds: string[];
  onSelectChange: (
    resource: ContentNode,
    parents: string[],
    selected: boolean
  ) => void;
  fullySelected: boolean;
  filterPermission: ConnectorPermission;
  viewType: ContentNodesViewType;
}) {
  const { resources, isResourcesLoading, isResourcesError } =
    useConnectorPermissions({
      owner: owner,
      dataSource,
      parentId,
      filterPermission,
      disabled: dataSource.connectorId === null,
      viewType,
    });

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (isResourcesError) {
    return (
      <div className="text-warning text-sm">
        Failed to retrieve resources likely due to a revoked authorization.
      </div>
    );
  }

  useEffect(() => {
    if (parentIsSelected) {
      // Unselected previously selected children
      resources
        .filter((r) => selectedResourceIds.includes(r.internalId))
        .forEach((r) => {
          onSelectChange(r, parents, false);
        });
    }
  }, [
    resources,
    parentIsSelected,
    selectedResourceIds,
    onSelectChange,
    parents,
  ]);

  const isTablesView = viewType === "tables";
  return (
    <Tree isLoading={isResourcesLoading}>
      {resources.map((r) => {
        const isSelected = selectedResourceIds.includes(r.internalId);
        const partialChecked =
          !isSelected &&
          Boolean(selectedParents.find((id) => id === r.internalId));

        const IconComponent = getIconForType(r.type);
        const checkable = !isTablesView || r.type === "database";
        // const showCheckbox = checkable || checkStatus !== "unchecked";
        return (
          <Tree.Item
            key={r.internalId}
            collapsed={!expanded[r.internalId]}
            onChevronClick={() => {
              setExpanded((prev) => ({
                ...prev,
                [r.internalId]: prev[r.internalId] ? false : true,
              }));
            }}
            visual={<IconComponent className="s-h-4 s-w-4" />}
            type={r.expandable && showExpand ? "node" : "leaf"}
            label={r.title}
            variant={r.type}
            className="whitespace-nowrap"
            checkbox={
              checkable && r.preventSelection !== true
                ? {
                    disabled: parentIsSelected || fullySelected,
                    checked: isSelected || fullySelected,
                    partialChecked: partialChecked,
                    onChange: (checked) => {
                      onSelectChange(r, parents, checked);
                    },
                  }
                : undefined
            }
          >
            {expanded[r.internalId] && (
              <DataSourceResourceSelectorChildren
                owner={owner}
                dataSource={dataSource}
                parentId={r.internalId}
                showExpand={showExpand}
                // In table view, only manually selected nodes are considered and hierarchy does not apply.
                selectedParents={selectedParents}
                selectedResourceIds={selectedResourceIds}
                onSelectChange={onSelectChange}
                parents={[...parents, r.internalId]}
                parentIsSelected={parentIsSelected || isSelected}
                fullySelected={fullySelected}
                filterPermission={filterPermission}
                viewType={viewType}
              />
            )}
          </Tree.Item>
        );
      })}
    </Tree>
  );
}
