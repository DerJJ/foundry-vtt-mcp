/**
 * Folder paths address nested folders as "Iron Gods/Book 1/Torch".
 *
 * Kept pure and side-effect free: resolution against game.folders happens in the
 * Foundry module, but validating the path here means bad input fails on the server
 * with a clear message instead of creating oddly-named folders in the world.
 *
 * Note: a folder name containing a literal "/" cannot be expressed as a path.
 */

/** Foundry's own sidebar becomes unusable well before this depth. */
export const MAX_FOLDER_DEPTH = 8;

export function parseFolderPath(folderPath: string): string[] {
  if (folderPath.trim() === '') {
    throw new Error('Folder path is empty');
  }

  const segments = folderPath.split('/').map(segment => segment.trim());

  if (segments.some(segment => segment === '')) {
    throw new Error(
      `Folder path has an empty segment: "${folderPath}". ` +
        `Use "Parent/Child" without leading, trailing, or doubled slashes.`
    );
  }

  if (segments.length > MAX_FOLDER_DEPTH) {
    throw new Error(
      `Folder path exceeds the maximum depth of ${MAX_FOLDER_DEPTH}: "${folderPath}"`
    );
  }

  return segments;
}
