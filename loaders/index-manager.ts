/**
 * Index Manager - Handles metadata, version tracking, and index health
 * Replaces Python index_state_manager.py
 *
 * Features:
 * - Version metadata storage in special _metadata document
 * - Index state tracking (last loaded, document count, etc.)
 * - Incremental update support
 * - Health check utilities
 */

import { SearchBackend } from "../src/services/meilisearch";

const METADATA_DOC_ID = "_metadata";

export interface IndexMetadata {
  version?: string;
  timestamp?: string;
  fecha_creacion?: string;
  cantidad?: number;
  [key: string]: any;
}

export interface IndexState {
  id: string;
  entity_type: string;
  last_updated: string;
  metadata_version: string;
  metadata_created: string;
  document_count: number;
  file_hash: string;
}

export class IndexManager {
  private backend: SearchBackend;

  constructor() {
    this.backend = new SearchBackend();
  }

  /**
   * Get metadata from an index (stored in special _metadata document)
   */
  async getIndexMetadata(indexName: string): Promise<IndexMetadata | null> {
    try {
      const index = await this.backend.getIndex(indexName);
      const doc = await index.getDocument(METADATA_DOC_ID);

      if (doc) {
        return doc as IndexMetadata;
      }
      return null;
    } catch (error) {
      console.log(
        `No metadata found for index ${indexName}: ${error}`
      );
      return null;
    }
  }

  /**
   * Save metadata to an index
   */
  async saveIndexMetadata(
    indexName: string,
    metadata: IndexMetadata
  ): Promise<void> {
    try {
      const index = await (this.backend as any).getOrCreateIndex(indexName, {
        primaryKey: "id",
      });
      const doc = {
        id: METADATA_DOC_ID,
        ...metadata,
      };

      const task = await index.updateDocuments([doc], {
        primaryKey: "id",
      });

      if (task && (task as any).taskUid) {
        const result = await (this.backend as any).client.waitForTask(
          (task as any).taskUid,
          { timeOutMs: 600000 } // 10 minutes — may queue behind bulk document tasks
        );

        if (result?.status === "failed") {
          throw new Error(
            result.error?.message || `Failed to store metadata for ${indexName}`
          );
        }
      }

      console.log(`✅ Saved metadata for index ${indexName}`);
    } catch (error) {
      console.error(
        `Failed to save metadata for ${indexName}: ${error}`
      );
      throw error;
    }
  }

  /**
   * Check if index needs updating based on version
   */
  async needsUpdate(
    indexName: string,
    newMetadata: IndexMetadata
  ): Promise<boolean> {
    try {
      const currentMetadata = await this.getIndexMetadata(indexName);

      if (!currentMetadata) {
        // No metadata = needs loading
        return true;
      }

      if (!currentMetadata.version || !newMetadata.version) {
        return true;
      }

      // Compare versions
      if (currentMetadata.version !== newMetadata.version) {
        console.log(
          `Version mismatch for ${indexName}: ` +
            `current=${currentMetadata.version}, new=${newMetadata.version}`
        );
        return true;
      }

      console.log(
        `Index ${indexName} is up to date (v${currentMetadata.version})`
      );
      return false;
    } catch (error) {
      console.log(`Error checking update status for ${indexName}: ${error}`);
      return true; // Default to needing update on error
    }
  }

  /**
   * Get comprehensive index state
   */
  async getIndexState(indexName: string): Promise<IndexState | null> {
    try {
      const index = await this.backend.getIndex(indexName);
      const stats = await index.getStats();
      const metadata = await this.getIndexMetadata(indexName);

      if (!metadata) {
        return null;
      }

      return {
        id: indexName,
        entity_type: indexName,
        last_updated: new Date().toISOString(),
        metadata_version: metadata.version || "unknown",
        metadata_created: metadata.fecha_creacion || "unknown",
        document_count: stats.numberOfDocuments || 0,
        file_hash: "", // Could be computed from metadata
      };
    } catch (error) {
      console.error(`Failed to get state for ${indexName}: ${error}`);
      return null;
    }
  }

  /**
   * Compare two versions
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}
