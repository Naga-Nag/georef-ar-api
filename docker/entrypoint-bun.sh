#!/bin/sh
# Entrypoint script for Bun Georef AR API
# Handles environment setup, health checks, and service initialization

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
MEILISEARCH_HOST="${MEILISEARCH_HOST:-http://localhost:7700}"
MEILISEARCH_TIMEOUT="${MEILISEARCH_TIMEOUT:-60}"
LOG_LEVEL="${LOG_LEVEL:-info}"
BATCH_SIZE="${BATCH_SIZE:-2000}"
MAX_PENDING_BATCHES="${MAX_PENDING_BATCHES:-8}"

# Keep batch sizes in a safe range to avoid long blocking indexing tasks.
if ! echo "${BATCH_SIZE}" | grep -Eq '^[0-9]+$'; then
  echo "${YELLOW}[LOAD]${NC} Invalid BATCH_SIZE=${BATCH_SIZE}. Falling back to 500"
  BATCH_SIZE=500
fi

if [ "${BATCH_SIZE}" -lt 100 ]; then
  echo "${YELLOW}[LOAD]${NC} BATCH_SIZE too small (${BATCH_SIZE}). Using 100"
  BATCH_SIZE=100
fi

if [ "${BATCH_SIZE}" -gt 10000 ]; then
  echo "${YELLOW}[LOAD]${NC} BATCH_SIZE too large (${BATCH_SIZE}). Using 10000 for stable indexing"
  BATCH_SIZE=10000
fi

echo "${BLUE}========================================${NC}"
echo "${BLUE}Georef AR API (Bun.js)${NC}"
echo "${BLUE}========================================${NC}"
echo ""
echo "${YELLOW}[INIT]${NC} Environment: ${NODE_ENV:-production}"
echo "${YELLOW}[INIT]${NC} Meilisearch: ${MEILISEARCH_HOST}"
echo "${YELLOW}[INIT]${NC} Log Level: ${LOG_LEVEL}"
echo ""

# Function to check Meilisearch health
check_meilisearch_health() {
  local attempt=1
  local max_attempts=$((MEILISEARCH_TIMEOUT / 2))
  
  echo "${YELLOW}[HEALTH]${NC} Waiting for Meilisearch to be ready..."
  
  while [ $attempt -le $max_attempts ]; do
    if curl -s -f "${MEILISEARCH_HOST}/health" > /dev/null 2>&1; then
      echo "${GREEN}[HEALTH]${NC} Meilisearch is online and ready"
      return 0
    fi
    
    echo "${YELLOW}[HEALTH]${NC} Attempt ${attempt}/${max_attempts}: Waiting for Meilisearch..."
    sleep 2
    attempt=$((attempt + 1))
  done
  
  echo "${RED}[ERROR]${NC} Meilisearch health check failed after ${MEILISEARCH_TIMEOUT} seconds"
  return 1
}

# Function to verify Meilisearch connectivity
verify_meilisearch() {
  echo "${YELLOW}[VERIFY]${NC} Verifying Meilisearch connectivity..."
  
  if curl -s -f "${MEILISEARCH_HOST}/health" > /dev/null 2>&1; then
    local version=$(curl -s "${MEILISEARCH_HOST}/version" | grep -o '"version":"[^"]*"' | head -1 || echo "unknown")
    echo "${GREEN}[VERIFY]${NC} Meilisearch connection verified ($version)"
    return 0
  else
    echo "${RED}[ERROR]${NC} Failed to connect to Meilisearch at ${MEILISEARCH_HOST}"
    return 1
  fi
}

# Check Meilisearch health
if ! check_meilisearch_health; then
  echo "${RED}[ERROR]${NC} Failed: Meilisearch is not responding"
  exit 1
fi

# Verify connection
if ! verify_meilisearch; then
  echo "${RED}[ERROR]${NC} Failed: Cannot connect to Meilisearch"
  exit 1
fi

echo ""
echo "${YELLOW}[LOAD]${NC} Loading NDJSON data into Meilisearch..."
echo "${YELLOW}[LOAD]${NC} Batch Size: ${BATCH_SIZE} documents"
echo "${YELLOW}[LOAD]${NC} Max Pending Batches: ${MAX_PENDING_BATCHES}"
echo ""

# Load data into Meilisearch
# --gc-concurrent: aggressive GC during large batch indexing
# --smol: reduce initial heap size limit (helps with memory footprint during streaming)
bun --gc-concurrent --smol run loaders/index.ts --log-level "${LOG_LEVEL}" --batch-size "${BATCH_SIZE}" --max-pending-batches "${MAX_PENDING_BATCHES}"

if [ $? -ne 0 ]; then
  echo ""
  echo "${RED}[ERROR]${NC} Failed to load data into Meilisearch"
  exit 1
fi

echo ""
echo "${GREEN}[LOAD]${NC} Data loading completed successfully"
echo ""

# Clean up completed/failed Meilisearch tasks to prevent volume growth
echo "${YELLOW}[CLEANUP]${NC} Cleaning up completed Meilisearch tasks..."
if [ -n "${MEILISEARCH_API_KEY}" ]; then
  curl -s -X DELETE "${MEILISEARCH_HOST}/tasks?statuses=succeeded,failed,canceled" \
    -H "Authorization: Bearer ${MEILISEARCH_API_KEY}" > /dev/null 2>&1 && \
    echo "${GREEN}[CLEANUP]${NC} Task cleanup completed" || \
    echo "${YELLOW}[CLEANUP]${NC} Task cleanup skipped (non-critical)"
else
  curl -s -X DELETE "${MEILISEARCH_HOST}/tasks?statuses=succeeded,failed,canceled" > /dev/null 2>&1 && \
    echo "${GREEN}[CLEANUP]${NC} Task cleanup completed" || \
    echo "${YELLOW}[CLEANUP]${NC} Task cleanup skipped (non-critical)"
fi
echo ""

echo "${GREEN}[INIT]${NC} All checks passed. Starting API server..."
echo "${GREEN}[INIT]${NC} API will be available at http://0.0.0.0:${PORT:-5000}/health"
echo ""

# Start the application
exec "$@"
