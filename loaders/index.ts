/**
 * NDJSON data loader - CLI entry point
 * Usage:
 *   bun run loaders/index.ts [options]
 *
 * Examples:
 *   bun run loaders/index.ts                           # Load all entities in order
 *   bun run loaders/index.ts --entities provincias,departamentos   # Load specific entities
 *   bun run loaders/index.ts --entity provincias      # Load single entity
 *   bun run loaders/index.ts --log-level debug        # Verbose logging
 *   bun run loaders/index.ts --batch-size 500         # Custom batch size
 *   bun run loaders/index.ts --skip-validation        # Skip document validation
 */

import { NDJSONLoader, LoaderStatistics } from "./ndjson-loader";
import { IndexManager } from "./index-manager";
import {
  DATA_SOURCES,
  RECOMMENDED_LOAD_ORDER,
  parseEntityArgument,
  getAllEntities,
} from "./config";

interface CLIOptions {
  entities?: string[];
  batchSize: number;
  maxPendingBatches: number;
  logLevel: "debug" | "info" | "warn" | "error";
  skipValidation: boolean;
}

/**
 * Parse command-line arguments
 */
/**
 * Trigger garbage collection to prevent memory exhaustion during large loads
 * Call this between batches for big indexing operations
 */
function triggerGarbageCollection() {
  // Bun supports --gc flag at runtime: bun --gc-concurrent run loaders/index.ts
  // This helper exists for future manual GC if needed
  if ((global as any).gc) {
    (global as any).gc();
  }
}

function parseArguments(): CLIOptions {
  const args = Bun.argv.slice(2);
  const options: CLIOptions = {
    batchSize: 2000,
    maxPendingBatches: 8,
    logLevel: "info",
    skipValidation: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--entities":
      case "--entity":
        if (nextArg) {
          options.entities = parseEntityArgument(nextArg);
          i++;
        }
        break;

      case "--batch-size":
        if (nextArg) {
          options.batchSize = parseInt(nextArg, 10);
          i++;
        }
        break;

      case "--max-pending-batches":
        if (nextArg) {
          options.maxPendingBatches = parseInt(nextArg, 10);
          i++;
        }
        break;

      case "--log-level":
        if (nextArg) {
          const level = nextArg.toLowerCase();
          if (["debug", "info", "warn", "error"].includes(level)) {
            options.logLevel = level as "debug" | "info" | "warn" | "error";
            i++;
          }
        }
        break;

      case "--skip-validation":
        options.skipValidation = true;
        break;

      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;

      default:
        if (arg.startsWith("--")) {
          console.warn(`Unknown option: ${arg}`);
        }
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
🚀 NDJSON Data Loader for Georef AR API

Usage:
  bun run loaders/index.ts [options]

Options:
  --entities ENTITIES         Comma-separated list of entities to load
                             (default: all in recommended order)
  --entity ENTITY            Load single entity
  --batch-size SIZE          Documents per batch (default: 2000)
  --max-pending-batches N    Unverified Meilisearch batch tasks (default: 8)
  --log-level LEVEL          Log verbosity: debug, info, warn, error
                             (default: info)
  --skip-validation          Skip document validation (default: validation is skipped)
  --help, -h                 Show this help message

Examples:
  # Load all entities
  bun run loaders/index.ts

  # Load specific entities  
  bun run loaders/index.ts --entities provincias,departamentos,municipios

  # Load with verbose logging
  bun run loaders/index.ts --log-level debug

  # Load with validation enabled
  bun run loaders/index.ts --validate

Available Entities:
${getAllEntities().map((e) => `  - ${e}`).join("\n")}

Recommended Load Order:
${RECOMMENDED_LOAD_ORDER.map((e, i) => `  ${i + 1}. ${e}`).join("\n")}
  `);
}

/**
 * Display loading statistics
 */
function displayStatistics(stats: LoaderStatistics, batchSize: number): void {
  const succeeded = stats.processedDocs;
  const failed = stats.failedDocs;
  const skipped = stats.skippedDocs;
  const duration = (stats.duration / 1000).toFixed(2);

  console.log(`
📊 Loading Statistics for ${stats.indexName}
${"=".repeat(50)}
  URL:              ${stats.url}
  Duration:         ${duration}s
  Total Lines:      ${stats.totalDocs}
  Processed:        ${succeeded} ✅
  Failed:           ${failed} ❌
  Skipped:          ${skipped} ⏭️
  Success Rate:     ${((succeeded / stats.totalDocs) * 100).toFixed(1)}%
  Docs/Second:      ${(succeeded / (stats.duration / 1000)).toFixed(0)}
  Batch Size:       ${stats.processedDocs > 0 ? String(batchSize) : "N/A"}
${
  stats.metadata
    ? `
  Metadata Version: ${stats.metadata.version || "unknown"}
  Created:         ${stats.metadata.fecha_creacion || "unknown"}
`
    : ""
}
  `);
}

/**
 * Load data for a single entity using shared loader/manager instances
 */
async function loadEntity(
  entityName: string,
  _options: CLIOptions,
  loader: NDJSONLoader,
  indexManager: IndexManager
): Promise<LoaderStatistics | null> {
  const source = DATA_SOURCES[entityName];
  if (!source) {
    console.error(`❌ Unknown entity: ${entityName}`);
    return null;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`📦 Loading: ${source.name}`);
  console.log(`${"=".repeat(60)}`);

  try {
    // Step 1: Extract metadata from remote source (lightweight)
    console.log(`  📋 Checking remote metadata...`);
    const remoteMetadata = await loader.getMetadataOnly(source.url);

    if (!remoteMetadata) {
      // If we can't fetch remote metadata, check if the index already has data
      // to avoid unnecessary full re-indexes that grow the volume
      const existingMetadata = await indexManager.getIndexMetadata(source.index);
      if (existingMetadata) {
        console.log(
          `  ✅ ${source.name} already indexed (v${existingMetadata.version}), remote metadata unavailable. Skipping.`
        );
        return {
          totalDocs: 0,
          processedDocs: 0,
          failedDocs: 0,
          skippedDocs: 0,
          duration: 0,
          url: source.url,
          indexName: source.index,
          metadata: existingMetadata,
        };
      }
      console.warn(
        `  ⚠️  No metadata found for ${source.name} and index is empty, proceeding with full load`
      );
    } else {
      if (!remoteMetadata.version) {
        console.warn(
          `  ⚠️  Metadata for ${source.name} has no version, proceeding with full load`
        );
      } else {
      // Step 2: Check if index needs updating
        const needsUpdate = await indexManager.needsUpdate(
          source.index,
          remoteMetadata
        );

        if (!needsUpdate) {
          console.log(
            `  ✅ ${source.name} is up to date (v${remoteMetadata.version}). Skipping load.`
          );
          return {
            totalDocs: 0,
            processedDocs: 0,
            failedDocs: 0,
            skippedDocs: 0,
            duration: 0,
            url: source.url,
            indexName: source.index,
            metadata: remoteMetadata,
          };
        }
      }

      console.log(
        `  🔄 Version mismatch or new index. Loading ${source.name}...`
      );
    }

    // Step 3: Load data
    const stats = await loader.loadFromURL(source.url, source.index);

    // Step 4: Save metadata tracking
    if (stats.metadata?.version) {
      await indexManager.saveIndexMetadata(source.index, stats.metadata);
    }

    displayStatistics(stats, _options.batchSize);
    return stats;
  } catch (error) {
    console.error(`\n❌ Failed to load ${source.name}: ${error}\n`);
    return null;
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const options = parseArguments();
  const entitiesToLoad = options.entities || RECOMMENDED_LOAD_ORDER;

  if (entitiesToLoad.length === 0) {
    console.error("❌ No entities to load");
    process.exit(1);
  }

  console.log(`
╔════════════════════════════════════════════════════════╗
║   🚀 Georef AR API - NDJSON Data Loader (Bun)          ║
║   Phase 4: Data Loading Pipeline                        ║
╚════════════════════════════════════════════════════════╝
  `);

  console.log(`Configuration:`);
  console.log(`  Entities:         ${entitiesToLoad.join(", ")}`);
  console.log(`  Batch Size:       ${options.batchSize}`);
  console.log(`  Pending Batches:  ${options.maxPendingBatches}`);
  console.log(`  Log Level:        ${options.logLevel}`);
  console.log(`  Skip Validation:  ${options.skipValidation}`);

  // Create shared instances — avoid per-entity allocation of clients
  const loader = new NDJSONLoader({
    batchSize: options.batchSize,
    maxPendingBatches: options.maxPendingBatches,
    logLevel: options.logLevel,
    skipValidation: options.skipValidation,
  });
  const indexManager = new IndexManager();

  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  // Load entities in order
  for (const entity of entitiesToLoad) {
    const stats = await loadEntity(entity, options, loader, indexManager);

    if (stats) {
      successCount++;
    } else {
      failureCount++;
      if (options.logLevel !== "info") {
        // Continue on error unless verbose
        console.warn(`⚠️  Continuing despite error for ${entity}`);
      }
    }

    // Trigger GC between entities to reclaim memory
    triggerGarbageCollection();
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`
╔════════════════════════════════════════════════════════╗
║   ✅ Loading Complete                                   ║
╚════════════════════════════════════════════════════════╝

Results Summary:
  Successful:       ${successCount}/${entitiesToLoad.length} ✅
  Failed:           ${failureCount}/${entitiesToLoad.length} ❌
  Total Time:       ${totalDuration}s

Next Steps:
  1. Verify all data in Meilisearch dashboard
  2. Run integration tests: bun test tests/integration/
  3. Start API server: bun run src/index.ts
  `);

  if (failureCount > 0) {
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.main) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
