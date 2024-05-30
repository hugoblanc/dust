import {
  Button,
  DocumentPlusIcon,
  DocumentTextIcon,
  DropdownMenu,
  Searchbar,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import type { DataSourceSearchResultType } from "@dust-tt/types";
import { useEffect, useState } from "react";

import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";

export function DocumentPicker({
  owner,
  onItemClick,
  pickerButton,
  size = "md",
}: {
  owner: WorkspaceType;
  onItemClick: (document: DataSourceSearchResultType) => void;
  pickerButton?: React.ReactNode;
  size?: "sm" | "md";
}) {
  const MIN_CHARACTERS_TO_SEARCH = 3;
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedDocuments, setSearchedDocuments] = useState<
    DataSourceSearchResultType[]
  >([]);
  const [clickedDocuments, setClickedDocuments] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      const executeSearch = async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/w/${owner.sId}/data_sources/search?query=${encodeURIComponent(
              searchText
            )}`
          );
          if (res.ok) {
            const documents: DataSourceSearchResultType[] = (await res.json())
              .documents;
            setSearchedDocuments(documents);
          }
        } catch (error) {
          console.error("Error fetching documents:", error);
        } finally {
          setLoading(false);
        }
      };

      if (searchText.length >= MIN_CHARACTERS_TO_SEARCH) {
        void executeSearch();
      } else if (searchText.length === 0) {
        setSearchedDocuments([]);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [searchText, owner.sId]);

  const handleAddClick = (document: DataSourceSearchResultType) => {
    setClickedDocuments((prev) => new Set(prev).add(document.documentId));
    onItemClick(document);
  };

  return (
    <DropdownMenu>
      {() => (
        <>
          <div onClick={() => setSearchText("")} className="flex">
            {pickerButton ? (
              <DropdownMenu.Button size={size}>
                {pickerButton}
              </DropdownMenu.Button>
            ) : (
              <DropdownMenu.Button
                icon={DocumentPlusIcon}
                size={size}
                tooltip="Pick a document"
                tooltipPosition="above"
              />
            )}
          </div>
          <DropdownMenu.Items
            origin="auto"
            width={700} // Adjust width as needed
            topBar={
              <>
                <div className="flex flex-grow flex-row border-b border-structure-50 p-3">
                  <Searchbar
                    placeholder="Search"
                    name="input"
                    size="sm" // Increase search bar size
                    value={searchText}
                    onChange={setSearchText}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchedDocuments.length > 0) {
                        onItemClick(searchedDocuments[0]);
                        setSearchText("");
                      } else if (e.key === "Space") {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>
              </>
            }
          >
            {loading ? (
              <Spinner variant="color" size="lg" />
            ) : searchedDocuments.length > 0 ? (
              searchedDocuments.map((d) => (
                <div
                  key={`document-picker-container-${d.documentId}`}
                  className="flex flex-row items-center justify-between pr-4" // Increase padding
                >
                  <DropdownMenu.Item
                    key={`document-picker-${d.documentId}`}
                    label={
                      d.documentTitle.length > 60
                        ? `${d.documentTitle.slice(0, 60)} ...`
                        : d.documentTitle
                    }
                    description={d.highlightedText}
                    icon={
                      d.connectorProvider
                        ? CONNECTOR_CONFIGURATIONS[d.connectorProvider]
                            .logoComponent
                        : DocumentTextIcon
                    }
                    onClick={() => {
                      onItemClick(d);
                      setSearchText("");
                    }}
                  />
                  <Button
                    label="Add"
                    className="ml-2 rounded bg-blue-500 px-2 py-1 text-white disabled:cursor-not-allowed disabled:bg-gray-300"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent the dropdown from closing
                      handleAddClick(d);
                    }}
                    disabled={clickedDocuments.has(d.documentId)}
                  />
                </div>
              ))
            ) : searchText.length < MIN_CHARACTERS_TO_SEARCH ? (
              <div className="text-sm text-element-600">
                Type at least {MIN_CHARACTERS_TO_SEARCH} characters to search in
                your documents titles.
              </div>
            ) : (
              <div className="text-sm text-element-600">
                No titles match <b>"{searchText}"</b>.
              </div>
            )}
          </DropdownMenu.Items>
        </>
      )}
    </DropdownMenu>
  );
}
