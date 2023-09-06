import { uuid4 } from "@temporalio/workflow";
import memoize from "lodash.memoize";

import { updateDocumentParentsField } from "@connectors/lib/data_sources";
import { NotionDatabase, NotionPage } from "@connectors/lib/models";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

import {
  getDatabaseChildrenOfDocument,
  getNotionPageFromConnectorsDb,
  getPageChildrenOfDocument,
} from "./connectors_db_helpers";

/** Compute the parents field for a notion document See the [Design
 * Doc](https://www.notion.so/dust-tt/Engineering-e0f834b5be5a43569baaf76e9c41adf2?p=3d26536a4e0a464eae0c3f8f27a7af97&pm=s)
 * and the field documentation [in
 * core](https://github.com/dust-tt/dust/blob/main/core/src/data_sources/data_source.rs)
 * for relevant details
 *
 * @param memoizationKey optional key to control memoization of this function (not actually used by the functio)
 *
 */
async function _getParents(
  dataSourceInfo: DataSourceInfo,
  document: {
    notionId: string;
    parentType: string | null | undefined;
    parentId: string | null | undefined;
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- used for memoization
  memoizationKey?: string
): Promise<string[]> {
  const parents: string[] = [document.notionId];
  switch (document.parentType) {
    case "workspace":
      return parents;
    case "block":
      // rare cases in which doing something here is useful
      // are ignored for now, see the design doc for details
      return parents;
    case "page":
    case "database": {
      // retrieve the parent from notion connectors db
      // and add it to the parents array
      const parent = await getNotionPageFromConnectorsDb(
        dataSourceInfo,
        document.parentId as string // (cannot be null here)
      );
      if (!parent) {
        // The parent is either not synced yet (not an issue, see design doc) or
        // is not in Dust's scope, in both cases we can just return the page id
        return parents;
      }
      return parents.concat(
        await getParents(dataSourceInfo, {
          notionId: parent.notionPageId,
          parentType: parent.parentType,
          parentId: parent.parentId,
        })
      );
    }
    default:
      throw new Error(`Unhandled parent type ${document.parentType}`);
  }
}

export const getParents = memoize(
  _getParents,
  (dataSourceInfo, document, memoizationKey) => {
    return `${dataSourceInfo.dataSourceName}:${document.notionId}:${memoizationKey}`;
  }
);

export async function updateAllParentsFields(
  dataSourceConfig: DataSourceConfig,
  documents: (NotionPage | NotionDatabase)[],
  memoizationKey?: string
) {
  /* Computing all descendants, then updating, ensures the field is updated only
    once per page, limiting the load on the Datasource */
  const pagesToUpdate = await getPagesToUpdate(documents, dataSourceConfig);

  // Update everybody's parents field. Use of a memoization key to control
  // sharing memoization across updateAllParentsFields calls, which
  // can be desired or not depending on the use case
  for (const page of pagesToUpdate) {
    const parents = await getParents(
      dataSourceConfig,
      {
        notionId: page.notionPageId,
        parentType: page.parentType,
        parentId: page.parentId,
      },
      memoizationKey
    );

    await updateDocumentParentsField(
      dataSourceConfig,
      `notion-${page.notionPageId}`,
      parents
    );
  }
}

/**  Get ids of all pages whose parents field should be updated: initial pages in
 * documentIds, and all the descendants of documentIds that are pages (including
 * children of databases)
 *
 * Note: databases are not stored in the Datasource, so they don't need to be
 * updated
 */
async function getPagesToUpdate(
  documents: (NotionPage | NotionDatabase)[],
  dataSourceConfig: DataSourceConfig
): Promise<NotionPage[]> {
  const pagesToUpdate: NotionPage[] = [];

  let i = 0;
  while (i < documents.length) {
    // Visit next document and if it's a page add it to update list
    const document = documents[i++] as NotionPage | NotionDatabase;
    const documentId = notionId(document);
    if ((document as NotionPage).notionPageId) {
      pagesToUpdate.push(document as NotionPage);
    }

    // Get children of the document
    const pageChildren = await getPageChildrenOfDocument(
      dataSourceConfig,
      documentId
    );
    const databaseChildren = await getDatabaseChildrenOfDocument(
      dataSourceConfig,
      documentId
    );

    // If they haven't yet been visited, add them to documents visited
    // and to the list of documents whose children should be fetched
    for (const child of [...pageChildren, ...databaseChildren]) {
      if (!documents.some((d) => notionId(d) === notionId(child))) {
        documents.push(child);
      }
    }
  }

  return pagesToUpdate;
}

function notionId(document: NotionPage | NotionDatabase): string {
  return (
    (document as NotionPage).notionPageId ||
    (document as NotionDatabase).notionDatabaseId
  );
}
