/**
 * NDJSON streamer and loader
 * Replaces Python load_ndjson_to_meilisearch.py
 *
 * Features:
 * - Stream NDJSON data directly from URLs
 * - Batch document processing
 * - UTF-8 error handling with detailed logging
 * - Version metadata tracking
 * - Index health checks
 * - Data validation and transformation
 */

import { SearchBackend } from "../src/services/meilisearch";
import type { Index } from "meilisearch";
import type { ReadableStreamDefaultReader as NodeReadableStreamDefaultReader } from "node:stream/web";

export interface LoaderOptions {
  batchSize?: number;
  maxPendingBatches?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
  skipValidation?: boolean;
  maxRetries?: number;
}

export interface LoaderStatistics {
  totalDocs: number;
  processedDocs: number;
  failedDocs: number;
  skippedDocs: number;
  duration: number;
  url: string;
  indexName: string;
  metadata?: Record<string, any>;
}

export interface DocumentMetadata {
  version?: string;
  timestamp?: string;
  fecha_creacion?: string;
  cantidad?: number;
  [key: string]: any;
}

export interface IndexHealth {
  isHealthy: boolean;
  indexName: string;
  documentCount?: number;
  error?: string;
}

// Reuse a single TextDecoder instance across all operations
const sharedDecoder = new TextDecoder("utf-8", { fatal: false });

export class NDJSONLoader {
  private backend: SearchBackend;
  private batchSize: number;
  private maxPendingBatches: number;
  private logLevel: string;
  private maxRetries: number;
  private skipValidation: boolean;
  // Cache index references to avoid repeated lookups
  private indexCache: Map<string, Index> = new Map();

  constructor(options: LoaderOptions = {}) {
    this.backend = new SearchBackend();
    this.batchSize = options.batchSize || 2000;
    this.maxPendingBatches = options.maxPendingBatches || 8;
    this.logLevel = options.logLevel || "info";
    this.maxRetries = options.maxRetries || 3;
    this.skipValidation = options.skipValidation || false;
  }

  /**
   * Extract metadata from the first line of NDJSON file without loading all data
   * Used for version checking before full load
   */
  async getMetadataOnly(url: string): Promise<DocumentMetadata | null> {
    this.log("debug", `Fetching metadata from ${url}...`);

    try {
      const response = await this.fetchWithRetries(url);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response body available");
      }

      let buffer = "";
      let metadata: DocumentMetadata | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (value) {
            buffer += sharedDecoder.decode(value, { stream: true });

            // Look for first complete line
            const lines = buffer.split("\n");
            if (lines.length > 1 || (done && buffer.trim())) {
              const firstLine = lines[0];

              if (firstLine.trim()) {
                try {
                  const doc = JSON.parse(firstLine);

                  // Check for explicit _metadata field
                  if (doc._metadata) {
                    metadata = doc._metadata;
                    this.log("debug", "Found _metadata field");
                    break;
                  }

                  // Check if it looks like metadata
                  if (
                    this.isLikelyMetadata(doc) &&
                    (doc.version || doc.fecha_creacion || doc.cantidad)
                  ) {
                    metadata = doc;
                    this.log("debug", "Detected metadata-like document");
                    break;
                  }
                } catch (parseError) {
                  this.log(
                    "warn",
                    `Failed to parse first line for metadata: ${parseError}`
                  );
                }
              }

              // If we have more than one line and couldn't find metadata in first line,
              // the first line is probably actual data, not metadata
              if (lines.length > 1) {
                break;
              }
            }
          }

          if (done) {
            break;
          }
        }
      } finally {
        // CRITICAL: Cancel the stream to stop downloading the rest of the file
        await reader.cancel();
        reader.releaseLock();
      }

      if (metadata) {
        this.log(
          "info",
          `✅ Metadata found: version=${metadata.version}, cantidad=${metadata.cantidad}`
        );
      } else {
        this.log("warn", "No metadata found in first line");
      }

      return metadata;
    } catch (error) {
      this.log("error", `Failed to extract metadata: ${error}`);
      return null;
    }
  }

  /**
   * Load NDJSON data from a URL with full statistics
   */
  async loadFromURL(
    url: string,
    indexName: string
  ): Promise<LoaderStatistics> {
    const startTime = Date.now();
    this.log("info", `🚀 Loading ${indexName} from ${url}...`);

    try {
      // Check index health before loading
      const health = await this.checkIndexHealth(indexName);
      if (!health.isHealthy) {
        this.log("warn", `Index ${indexName} may have issues: ${health.error}`);
      }

      // Load data and collect metadata
      const response = await this.fetchWithRetries(url);
      const reader = response.body?.getReader();

      if (!reader) {
        throw new Error("No response body available");
      }

      const stats = await this.streamNDJSON(reader, indexName, url);
      stats.duration = Date.now() - startTime;

      this.log(
        "info",
        `✅ Completed loading ${indexName} in ${stats.duration}ms - ` +
          `Processed: ${stats.processedDocs}, Failed: ${stats.failedDocs}`
      );

      return stats;
    } catch (error) {
      this.log("error", `❌ Failed to load ${indexName}: ${error}`);
      throw error;
    }
  }

  /**
   * Fetch with automatic retries
   */
  private async fetchWithRetries(
    url: string,
    retryCount: number = 0
  ): Promise<Response> {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "GeorfefAR-Bun-Loader/2.0",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (retryCount < this.maxRetries) {
        this.log(
          "warn",
          `Retry ${retryCount + 1}/${this.maxRetries} for ${url}`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.fetchWithRetries(url, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Stream and parse NDJSON with metadata extraction
   */
  private async streamNDJSON(
    reader: NodeReadableStreamDefaultReader<any>,
    indexName: string,
    url: string
  ): Promise<LoaderStatistics> {
    let buffer = "";
    let batch: any[] = [];
    let lineNumber = 0;
    let processedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let batchCount = 0;
    let verifiedBatchCount = 0;
    let metadata: DocumentMetadata | undefined;
    let isFirstLine = true;
    // Sliding window of submitted-but-not-yet-verified task UIDs.
    // Batches are submitted without blocking on task completion;
    // tasks are verified in groups to maintain backpressure.
    const pendingTasks: Array<{ uid: number; size: number }> = [];
    // Cache index reference to avoid repeated lookups per batch
    const index = await this.getCachedIndex(indexName);

    const stats: LoaderStatistics = {
      totalDocs: 0,
      processedDocs: 0,
      failedDocs: 0,
      skippedDocs: 0,
      duration: 0,
      url,
      indexName,
    };

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (value) {
          // Reuse shared TextDecoder — no per-chunk allocation
          buffer += sharedDecoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            lineNumber++;

            try {
              const doc = JSON.parse(line);

              // Extract metadata from first line (multiple approaches)
              if (isFirstLine) {
                // Approach 1: Check for explicit _metadata field
                if (doc._metadata) {
                  metadata = doc._metadata;
                  isFirstLine = false;
                  skippedCount++;
                  this.log("debug", "Extracted metadata from line 1");
                  continue;
                }

                // Approach 2: Check if it looks like metadata (has version, fecha_creacion, cantidad)
                if (
                  this.isLikelyMetadata(doc) &&
                  (doc.version || doc.fecha_creacion || doc.cantidad)
                ) {
                  metadata = doc;
                  isFirstLine = false;
                  skippedCount++;
                  this.log("debug", "Detected metadata-like document on line 1");
                  continue;
                }

                isFirstLine = false;
              }

              // Skip validation by default for large loads to save memory
              // Set skipValidation=false if document validation is critical
              if (!this.skipValidation) {
                const validation = this.validateDocument(doc, indexName);
                if (!validation.valid) {
                  this.log(
                    "debug",
                    `Line ${lineNumber}: ${validation.message}`
                  );
                  failedCount++;
                  continue;
                }
              }

              // Transform document (uses pre-computed timestamp)
              const transformed = this.transformDocument(doc, indexName);
              batch.push(transformed);

              if (batch.length >= this.batchSize) {
                const result = await this.submitBatchOnly(index, batch, indexName);
                batch = [];
                batchCount++;
                if (result.uid !== undefined) {
                  pendingTasks.push({ uid: result.uid, size: result.size });
                } else {
                  processedCount += result.size;
                }

                // Drain the oldest tasks when the sliding window is full.
                // Keeping maxPendingBatches tasks unverified at a time provides
                // backpressure while allowing continuous streaming.
                if (pendingTasks.length >= this.maxPendingBatches * 2) {
                  const drained = await this.drainTasks(
                    pendingTasks,
                    this.maxPendingBatches,
                    indexName,
                    processedCount,
                    metadata?.cantidad,
                    verifiedBatchCount
                  );
                  verifiedBatchCount += (this.maxPendingBatches);
                  processedCount += drained;
                }
              }
            } catch (parseError) {
              this.log(
                "warn",
                `Failed to parse line ${lineNumber} from ${indexName}: ${parseError}`
              );
              failedCount++;
            }
          }
        }

        if (done) {
          // Process remaining buffer
          if (buffer.trim()) {
            try {
              const doc = JSON.parse(buffer);
              
              // Check for metadata
              if (!metadata) {
                if (doc._metadata) {
                  metadata = doc._metadata;
                } else if (this.isLikelyMetadata(doc)) {
                  metadata = doc;
                }
              }
              
              // Only add to batch if it's not metadata
              if (!(this.isLikelyMetadata(doc))) {
                const transformed = this.transformDocument(doc, indexName);
                batch.push(transformed);
              } else {
                skippedCount++;
              }
            } catch (parseError) {
              this.log("warn", `Failed to parse final line: ${parseError}`);
              failedCount++;
            }
            buffer = "";  // Release buffer memory
          }

          // Index remaining batch
          if (batch.length > 0) {
            const result = await this.submitBatchOnly(index, batch, indexName);
            batchCount++;
            if (result.uid !== undefined) {
              pendingTasks.push({ uid: result.uid, size: result.size });
            } else {
              processedCount += result.size;
            }
            batch = [];
          }

          // Drain all remaining pending tasks
          const finalDrained = await this.drainTasks(
            pendingTasks,
            0,
            indexName,
            processedCount,
            metadata?.cantidad,
            verifiedBatchCount
          );
          processedCount += finalDrained;

          stats.totalDocs = lineNumber;
          stats.processedDocs = processedCount;
          stats.failedDocs = failedCount;
          stats.skippedDocs = skippedCount;
          stats.metadata = metadata;

          break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    return stats;
  }

  /**
   * Submit a batch to MeiliSearch without waiting for the indexing task to complete.
   * Returns the task UID so it can be verified later in a drain step.
   */
  private async submitBatchOnly(
    index: Index,
    batch: any[],
    indexName: string
  ): Promise<{ uid: number | undefined; size: number }> {
    const size = batch.length;
    try {
      const response = await index.addDocuments(batch, { primaryKey: "id" });
      const uid = (response as any)?.taskUid as number | undefined;
      return { uid, size };
    } catch (error) {
      this.log("error", `Failed to submit batch for ${indexName}: ${error}`);
      throw error;
    }
  }

  /**
   * Wait for pending MeiliSearch tasks until the queue shrinks to `keepLast`.
   * Returns the total number of verified documents.
   */
  private async drainTasks(
    pendingTasks: Array<{ uid: number; size: number }>,
    keepLast: number,
    indexName: string,
    processedSoFar: number,
    totalDocs: number | undefined,
    verifiedBatchOffset: number
  ): Promise<number> {
    let drained = 0;
    let i = 0;

    while (pendingTasks.length > keepLast) {
      const { uid, size } = pendingTasks.shift()!;
      const task = await (this.backend as any).client.waitForTask(uid, {
        timeOutMs: 300000, // 5 minutes per task
      });

      if (task?.status === "failed") {
        throw new Error(
          task.error?.message || `Indexing task ${uid} failed for ${indexName}`
        );
      }

      drained += size;
      i++;
      const batchNum = verifiedBatchOffset + i;
      const newTotal = processedSoFar + drained;
      const percentStr =
        totalDocs && totalDocs > 0
          ? ` [${((newTotal / totalDocs) * 100).toFixed(1)}%]`
          : "";
      const countStr =
        totalDocs && totalDocs > 0
          ? ` (${newTotal}/${totalDocs} docs)`
          : ` (${newTotal} docs)`;

      if (batchNum % 10 === 0) {
        this.log(
          "info",
          `📊 Indexed batch ${batchNum} for ${indexName}${percentStr}${countStr}`
        );
      } else {
        this.log(
          "debug",
          `📊 Indexed batch ${batchNum} for ${indexName}${percentStr}${countStr}`
        );
      }
    }

    return drained;
  }

  /**
   * Get or create a cached index reference
   */
  private async getCachedIndex(indexName: string): Promise<Index> {
    let index = this.indexCache.get(indexName);
    if (!index) {
      const createdIndex = await (this.backend as any).getOrCreateIndex(indexName, {
        primaryKey: "id",
      });
      index = createdIndex as Index;
      this.indexCache.set(indexName, index);
    }
    return index;
  }


  /**
   * Transform document according to entity type rules
   */
  private transformDocument(doc: any, _entityType: string): any {
    // Extract nested IDs to top level (like Python DocumentTransformer)
    if (doc.provincia && typeof doc.provincia === "object" && doc.provincia.id) {
      doc.provincia_id = doc.provincia.id;
    }

    if (doc.localidad && typeof doc.localidad === "object" && doc.localidad.id) {
      doc.localidad_id = doc.localidad.id;
    }

    if (
      doc.localidad_censal &&
      typeof doc.localidad_censal === "object" &&
      doc.localidad_censal.id
    ) {
      doc.localidad_id = doc.localidad_censal.id;
    }

    if (doc.calle && typeof doc.calle === "object" && doc.calle.categoria) {
      doc.categoria = doc.calle.categoria;
    }

    if (
      doc.calle_a &&
      typeof doc.calle_a === "object" &&
      doc.calle_a.categoria
    ) {
      doc.categoria = doc.calle_a.categoria;
    }

    return doc;
  }

  /**
   * Check if a document looks like metadata (has metadata-like keys)
   */
  private isLikelyMetadata(doc: any): boolean {
    if (!doc || typeof doc !== "object") return false;
    
    // Check for common metadata indicators
    const metadataKeys = [
      "_metadata",
      "metadata",
      "version",
      "fecha_creacion",
      "cantidad",
    ];
    
    const hasMetadataKeys = metadataKeys.some(
      (key) => key in doc && doc[key] !== null
    );
    
    return hasMetadataKeys && !("id" in doc);
  }

  /**
   * Validate document has required fields
   */
  private validateDocument(
    doc: any,
    entityType: string
  ): { valid: boolean; message: string } {
    if (!doc || typeof doc !== "object") {
      return { valid: false, message: "Document is not an object" };
    }

    if (!doc.id) {
      return { valid: false, message: "Missing required field: id" };
    }

    // Type-specific validations
    const requiredFields: Record<string, string[]> = {
      provincias: ["id", "nombre", "categoria"],
      departamentos: ["id", "nombre", "categoria", "provincia_id"],
      municipios: ["id", "nombre", "categoria", "provincia_id"],
      localidades: ["id", "nombre", "categoria"],
      asentamientos: ["id", "nombre", "categoria"],
      localidades_censales: ["id", "nombre", "categoria"],
      calles: ["id", "nombre", "categoria", "localidad_id"],
      cuadras: ["id", "categoria"],
      intersecciones: ["id", "categoria"],
    };

    const required = requiredFields[entityType] || [];
    for (const field of required) {
      if (!(field in doc)) {
        return { valid: false, message: `Missing required field: ${field}` };
      }
    }

    return { valid: true, message: "Document is valid" };
  }

  /**
   * Check if an index exists and is healthy
   */
  async checkIndexHealth(indexName: string): Promise<IndexHealth> {
    try {
      const index = await this.backend.getIndex(indexName);
      const stats = await index.getStats();

      return {
        isHealthy: true,
        indexName,
        documentCount: stats.numberOfDocuments,
      };
    } catch (error) {
      return {
        isHealthy: false,
        indexName,
        error: String(error),
      };
    }
  }

  /**
   * Log message with timestamp
   */
  private log(level: string, message: string): void {
    if (
      ["debug", "info", "warn", "error"].indexOf(level) >
      ["debug", "info", "warn", "error"].indexOf(this.logLevel)
    ) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelUpper = level.toUpperCase().padEnd(5);
    console.log(`[${timestamp}] [${levelUpper}] ${message}`);
  }
}
