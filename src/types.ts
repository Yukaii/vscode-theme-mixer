// copy from https://github.com/nonoroazoro/vscode-syncing/blob/master/src/common/types.ts

/**
 * Represents a VSCode extension.
 */
export interface IExtension
{
  /**
   * The extension's identifier in the form of: `publisher.name`.
   */
  id: string;

  /**
   * The extension's UUID.
   */
  uuid: string;

  /**
   * The extension's name.
   */
  name: string;

  /**
   * The extension's publisher.
   */
  publisher: string;

  /**
   * The extension's version.
   */
  version: string;

  /**
   * The installed extension's folder path.
   */
  path?: string;

  /**
   * The downloaded extension's zip file path.
   */
  zip?: string;
}