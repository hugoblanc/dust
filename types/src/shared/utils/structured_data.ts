import { slugify } from "./string_utils";

export function makeStructuredDataTableName(name: string, externalId: string) {
  const lowercasedExternalId = externalId.toLowerCase();
  const externalIdPrefix = lowercasedExternalId.substring(0, 4);
  const externalIdSuffix = lowercasedExternalId.slice(-6);

  const truncatedName = name.substring(0, 32);

  return slugify(`${truncatedName}_${externalIdPrefix}_${externalIdSuffix}`);
}

export class InvalidStructuredDataHeaderError extends Error {}

export function getSanitizedHeaders(rawHeaders: string[]) {
  return rawHeaders.reduce<string[]>((acc, curr) => {
    const slugifiedName = slugify(curr);

    if (!acc.includes(slugifiedName) || !slugifiedName.length) {
      acc.push(slugifiedName);
    } else {
      let conflictResolved = false;
      for (let i = 2; i < 64; i++) {
        if (!acc.includes(slugify(`${slugifiedName}_${i}`))) {
          acc.push(slugify(`${slugifiedName}_${i}`));
          conflictResolved = true;
          break;
        }
      }

      if (!conflictResolved) {
        throw new InvalidStructuredDataHeaderError(
          `Failed to generate unique slugified name for header "${curr}" after multiple attempts.`
        );
      }
    }
    return acc;
  }, []);
}
