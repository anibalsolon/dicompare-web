/**
 * Pyodide Web Worker
 * Runs all Python/dicompare processing in a background thread
 * to keep the main UI responsive.
 */

/// <reference lib="webworker" />

import type { WorkerRequest, WorkerResponse, ProgressPayload } from './workerTypes';
import { loadPyodide as loadPyodideModule, type PyodideInterface } from 'pyodide';
import { DICOMPARE_VERSION } from '../version';
import setupDicompareOffline from '../python/setup_dicompare_offline.py';
import setupDicompareOnline from '../python/setup_dicompare_online.py';
import getVersion from '../python/get_version.py';
import analyzeFiles from '../python/analyze_files.py';
import analyzeBatch from '../python/analyze_batch.py';
import validateAcquisition from '../python/validate_acquisition.py';
import loadProtocol from '../python/load_protocol.py';
import searchFields from '../python/search_fields.py';
import getFieldInfo from '../python/get_field_info.py';
import generateSchema from '../python/generate_schema.py';
import generateTestDicoms from '../python/generate_test_dicoms.py';
import categorizeFields from '../python/categorize_fields.py';
import clearCachePy from '../python/clear_cache.py';

// Use the official Pyodide types
type PyodideInstance = PyodideInterface;

let pyodide: PyodideInstance | null = null;

// Validation cache to avoid re-running validation for the same inputs
const validationCache = new Map<string, any>();

// Detect if running in Electron production (bundled app, no network required)
function isElectronProduction(): boolean {
  // In Electron production, we load from file:// protocol
  // In Electron dev, we load from http://localhost which still has network access
  return self.location.protocol === 'file:' ||
         self.location.protocol === 'app:' ||
         self.location.hostname === '';
}

// Detect if running in Electron at all (including dev mode)
function isElectron(): boolean {
  return isElectronProduction() ||
         (typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron'));
}

// Get the base URL for Pyodide files
function getPyodideBaseUrl(): string {
  if (isElectronProduction()) {
    // In Electron production, use bundled Pyodide
    // Worker is in assets/, pyodide is in pyodide/, so go up one level
    // We need absolute path for the pyodide.js import
    const workerUrl = self.location.href;
    const baseUrl = workerUrl.substring(0, workerUrl.lastIndexOf('/assets/') + 1);
    return baseUrl + 'pyodide/';
  }
  // In browser or Electron dev mode, use CDN
  return 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/';
}

// Get absolute URL for wheel files (for micropip)
function getWheelBaseUrl(): string {
  if (isElectronProduction()) {
    const workerUrl = self.location.href;
    const baseUrl = workerUrl.substring(0, workerUrl.lastIndexOf('/assets/') + 1);
    return baseUrl + 'pyodide/wheels/';
  }
  return '';
}

// Simple hash function for cache keys
function hashValidationInput(acquisition: any, schemaContent: string, acquisitionIndex?: number): string {
  const input = JSON.stringify({ acquisition, schemaContent, acquisitionIndex });
  // Simple hash - sum of char codes with position weighting
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

// Helper to send responses
function sendResponse(response: WorkerResponse): void {
  self.postMessage(response);
}

function sendSuccess(id: string, payload: any): void {
  sendResponse({ id, type: 'success', payload });
}

function sendError(id: string, error: Error): void {
  sendResponse({ id, type: 'error', error: { message: error.message, stack: error.stack } });
}

function sendProgress(id: string, progress: ProgressPayload): void {
  sendResponse({ id, type: 'progress', payload: progress });
}

// ============================================================================
// Initialization
// ============================================================================

async function initializePyodide(requestId?: string): Promise<{ pyodideVersion: string; dicompareVersion: string }> {
  console.log('[Worker] Initializing Pyodide...');
  const startTime = Date.now();
  const inElectronProd = isElectronProduction();
  const pyodideBaseUrl = getPyodideBaseUrl();

  console.log(`[Worker] Running in ${inElectronProd ? 'Electron production (offline)' : 'browser/dev (CDN)'}`);
  console.log(`[Worker] Pyodide base URL: ${pyodideBaseUrl}`);

  // Helper to send init progress
  const reportProgress = (message: string, percentage: number) => {
    if (requestId) {
      sendProgress(requestId, {
        percentage,
        currentOperation: message,
        totalFiles: 0,
        totalProcessed: 0
      });
    }
  };

  // Load Pyodide using the npm package (works with ES modules)
  reportProgress('Loading Python runtime...', 10);

  pyodide = await loadPyodideModule({
    indexURL: pyodideBaseUrl,
  });

  const loadTime = Date.now() - startTime;
  console.log(`[Worker] Pyodide loaded in ${loadTime}ms`);

  // Install core packages
  reportProgress('Installing core packages...', 30);
  await pyodide.loadPackage(['micropip', 'sqlite3']);

  // In Electron production, pre-load all Pyodide packages from local storage
  // This prevents micropip from trying to fetch dependencies from PyPI
  if (inElectronProd) {
    reportProgress('Loading offline packages...', 40);
    console.log('[Worker] Pre-loading Pyodide packages for offline use...');
    // Load all required Pyodide built-in packages from local storage
    // These will be loaded from indexURL (our local pyodide/ folder)
    await pyodide.loadPackage([
      'numpy', 'pandas', 'scipy', 'tqdm', 'jsonschema',
      'python-dateutil', 'pytz', 'six', 'attrs', 'packaging',
      'typing-extensions', 'setuptools', 'pillow', 'matplotlib',
      'contourpy', 'cycler', 'fonttools', 'kiwisolver', 'pyparsing',
      'referencing', 'jsonschema-specifications', 'rpds-py', 'pyrsistent'
    ]);
    console.log('[Worker] Pyodide packages loaded from local storage');
  }

  // Determine package source based on environment
  let packageSource: string;
  const wheelBase = getWheelBaseUrl();
  if (inElectronProd) {
    // In Electron production, install from bundled wheel with absolute path
    packageSource = wheelBase + `dicompare-${DICOMPARE_VERSION}-py3-none-any.whl`;
    console.log('[Worker] Installing dicompare from bundled wheel...');
    console.log('[Worker] Wheel base URL:', wheelBase);
  } else {
    // Detect development vs production using Vite's build mode
    // Note: Don't use hostname detection as localhost is used in production containers too
    const isDevelopment = import.meta.env?.MODE === 'development';
    packageSource = isDevelopment
      ? `http://localhost:3001/pyodide/wheels/dicompare-${DICOMPARE_VERSION}-py3-none-any.whl`
      : `dicompare==${DICOMPARE_VERSION}`;
    console.log(`[Worker] Installing dicompare from ${isDevelopment ? 'local dev server' : 'PyPI'}...`);
  }

  reportProgress('Loading DICOM analysis tools...', 60);

  // For Electron production, we need to install dependencies from bundled wheels too
  if (inElectronProd) {
    pyodide.globals.set('WHEEL_BASE', wheelBase);
    pyodide.globals.set('PACKAGE_SOURCE', packageSource);
    await pyodide.runPythonAsync(setupDicompareOffline);
  } else {
    pyodide.globals.set('PACKAGE_SOURCE', packageSource);
    await pyodide.runPythonAsync(setupDicompareOnline);
  }

  reportProgress('Finalizing...', 90);

  // Get versions
  pyodide.globals.set('DICOMPARE_VERSION', DICOMPARE_VERSION);
  const versionResult = await pyodide.runPython(getVersion);

  const versions = JSON.parse(versionResult);
  console.log(`[Worker] Ready - Python ${versions.pyodide}, dicompare ${versions.dicompare}`);

  reportProgress('Ready', 100);
  return { pyodideVersion: versions.pyodide, dicompareVersion: versions.dicompare };
}

// ============================================================================
// Message Handlers
// ============================================================================

async function handleAnalyzeFiles(
  id: string,
  payload: { fileNames: string[]; fileContents: ArrayBuffer[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fileNames, fileContents } = payload;
  console.log(`[Worker] Analyzing ${fileNames.length} files...`);

  // Set up progress callback that posts messages back to main thread
  pyodide.globals.set('progress_callback', (progress: any) => {
    const p = progress.toJs ? progress.toJs() : progress;
    sendProgress(id, {
      percentage: p.percentage || 0,
      currentOperation: p.currentOperation || 'Processing...',
      totalFiles: p.totalFiles || fileNames.length,
      totalProcessed: p.totalProcessed || 0
    });
  });

  // Convert ArrayBuffers to Uint8Arrays for Pyodide
  const contents = fileContents.map(buf => new Uint8Array(buf));

  pyodide.globals.set('dicom_file_names', fileNames);
  pyodide.globals.set('dicom_file_contents', contents);

  const result = await pyodide.runPythonAsync(analyzeFiles);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleAnalyzeBatch(
  id: string,
  payload: { fileNames: string[]; fileContents: ArrayBuffer[]; batchIndex: number; totalBatches: number }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fileNames, fileContents, batchIndex, totalBatches } = payload;
  console.log(`[Worker] Analyzing batch ${batchIndex + 1}/${totalBatches} (${fileNames.length} files)...`);

  // Set up progress callback scoped to this batch
  pyodide.globals.set('progress_callback', (progress: any) => {
    const p = progress.toJs ? progress.toJs() : progress;
    sendProgress(id, {
      percentage: p.percentage || 0,
      currentOperation: `Batch ${batchIndex + 1}/${totalBatches}: ${p.currentOperation || 'Processing...'}`,
      totalFiles: p.totalFiles || fileNames.length,
      totalProcessed: p.totalProcessed || 0
    });
  });

  // Convert ArrayBuffers to Uint8Arrays for Pyodide
  const contents = fileContents.map(buf => new Uint8Array(buf));

  pyodide.globals.set('dicom_file_names', fileNames);
  pyodide.globals.set('dicom_file_contents', contents);
  pyodide.globals.set('batch_index', batchIndex);
  pyodide.globals.set('total_batches', totalBatches);

  const result = await pyodide.runPythonAsync(analyzeBatch);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleValidateAcquisition(
  id: string,
  payload: { acquisition: any; schemaContent: string; acquisitionIndex?: number }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisition, schemaContent, acquisitionIndex } = payload;

  // Check cache first
  const cacheKey = hashValidationInput(acquisition, schemaContent, acquisitionIndex);
  const cachedResult = validationCache.get(cacheKey);
  if (cachedResult) {
    console.log('[Worker] Returning cached validation result');
    sendSuccess(id, cachedResult);
    return;
  }

  pyodide.globals.set('acquisition_data', acquisition);
  pyodide.globals.set('schema_content', schemaContent);
  pyodide.globals.set('schema_acquisition_index', acquisitionIndex ?? null);

  const result = await pyodide.runPython(validateAcquisition);

  const parsedResult = JSON.parse(result as string);

  // Debug: Log validation results to help identify wrong actualValue issues
  console.log('[Worker] Validation results:', JSON.stringify(parsedResult, null, 2));

  // Log any suspicious actualValue values (like simple numbers that might be counts/indices)
  const suspiciousResults = parsedResult.filter((r: any) =>
    r.actualValue !== undefined &&
    typeof r.actualValue === 'number' &&
    r.actualValue >= 0 && r.actualValue <= 10
  );
  if (suspiciousResults.length > 0) {
    console.warn('[Worker] Suspicious actualValue results (might be counts/indices instead of values):', suspiciousResults);
  }

  // Store in cache
  validationCache.set(cacheKey, parsedResult);
  console.log('[Worker] Cached validation result');

  sendSuccess(id, parsedResult);
}

async function handleLoadProtocolFile(
  id: string,
  payload: { fileContent: ArrayBuffer; fileName: string; fileType: string }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fileContent, fileName, fileType } = payload;
  console.log(`[Worker] Loading ${fileType} protocol: ${fileName}`);

  // Convert ArrayBuffer to base64
  const uint8Array = new Uint8Array(fileContent);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64Content = btoa(binary);

  pyodide.globals.set('_protocol_base64', base64Content);
  pyodide.globals.set('_protocol_filename', fileName);
  pyodide.globals.set('_protocol_type', fileType);

  const result = await pyodide.runPython(loadProtocol);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleSearchFields(
  id: string,
  payload: { query: string; limit: number }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { query, limit } = payload;

  pyodide.globals.set('_search_query', query);
  pyodide.globals.set('_search_limit', limit);

  const result = await pyodide.runPython(searchFields);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGetFieldInfo(
  id: string,
  payload: { fieldOrTag: string }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  pyodide.globals.set('_field_or_tag', payload.fieldOrTag);

  const result = await pyodide.runPython(getFieldInfo);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGenerateSchema(
  id: string,
  payload: { acquisitions: any[]; metadata: any }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisitions, metadata } = payload;

  // JSON-serialize on JS side to avoid Pyodide proxy conversion issues with nested objects
  pyodide.globals.set('_ui_acquisitions_json', JSON.stringify(acquisitions));
  pyodide.globals.set('_schema_metadata_json', JSON.stringify(metadata));

  const result = await pyodide.runPython(generateSchema);

  sendSuccess(id, JSON.parse(result as string));
}

async function handleGenerateTestDicoms(
  id: string,
  payload: { acquisition: any; testData: any[]; fields: any[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { acquisition, testData, fields } = payload;

  pyodide.globals.set('test_data_rows', testData);
  pyodide.globals.set('schema_fields', fields);
  pyodide.globals.set('acquisition_info', {
    protocolName: acquisition.protocolName,
    seriesDescription: acquisition.seriesDescription || 'Generated Test Data'
  });

  await pyodide.runPythonAsync(generateTestDicoms);

  const zipBytesResult = await pyodide.runPython(`dicom_zip_bytes`);

  let zipBytes: Uint8Array;
  if (Array.isArray(zipBytesResult)) {
    zipBytes = new Uint8Array(zipBytesResult);
  } else if (zipBytesResult && (zipBytesResult as any).toJs) {
    const jsArray = (zipBytesResult as any).toJs();
    zipBytes = new Uint8Array(jsArray);
  } else {
    throw new Error('Unexpected format for ZIP bytes');
  }

  // Send the raw bytes - main thread will convert to Blob
  sendSuccess(id, { zipBytes: Array.from(zipBytes) });
}

async function handleCategorizeFields(
  id: string,
  payload: { fields: any[]; testData: any[] }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { fields, testData } = payload;

  pyodide.globals.set('field_definitions', fields);
  pyodide.globals.set('test_data_rows', testData);

  try {
    const result = await pyodide.runPythonAsync(categorizeFields);

    sendSuccess(id, JSON.parse(result as string));
  } catch {
    sendSuccess(id, {
      standardFields: 0,
      handledFields: 0,
      unhandledFields: 0,
      unhandledFieldWarnings: []
    });
  }
}

async function handleClearCache(id: string): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  // Clear validation cache
  validationCache.clear();
  console.log('[Worker] Validation cache cleared');

  await pyodide.runPython(clearCachePy);

  sendSuccess(id, { cleared: true });
}

async function handleRunPython(
  id: string,
  payload: { code: string; globals?: Record<string, any> }
): Promise<void> {
  if (!pyodide) throw new Error('Pyodide not initialized');

  const { code, globals } = payload;
  if (globals) {
    for (const [name, value] of Object.entries(globals)) {
      pyodide.globals.set(name, value);
    }
  }
  const result = await pyodide.runPython(code);
  sendSuccess(id, result);
}

// ============================================================================
// Message Router
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const { id, type } = request;

  try {
    switch (type) {
      case 'initialize': {
        const versions = await initializePyodide(id);
        sendResponse({ type: 'ready', payload: versions });
        sendSuccess(id, versions);
        break;
      }
      case 'analyzeFiles':
        await handleAnalyzeFiles(id, request.payload);
        break;
      case 'analyzeBatch':
        await handleAnalyzeBatch(id, request.payload);
        break;
      case 'validateAcquisition':
        await handleValidateAcquisition(id, request.payload);
        break;
      case 'loadProtocolFile':
        await handleLoadProtocolFile(id, request.payload);
        break;
      case 'searchFields':
        await handleSearchFields(id, request.payload);
        break;
      case 'getFieldInfo':
        await handleGetFieldInfo(id, request.payload);
        break;
      case 'generateSchema':
        await handleGenerateSchema(id, request.payload);
        break;
      case 'generateTestDicoms':
        await handleGenerateTestDicoms(id, request.payload);
        break;
      case 'categorizeFields':
        await handleCategorizeFields(id, request.payload);
        break;
      case 'clearCache':
        await handleClearCache(id);
        break;
      case 'runPython':
        await handleRunPython(id, request.payload);
        break;
      default:
        sendError(id, new Error(`Unknown message type: ${(request as any).type}`));
    }
  } catch (error) {
    sendError(id, error instanceof Error ? error : new Error(String(error)));
  }
};

// Signal that the worker script has loaded
console.log('[Worker] Script loaded, waiting for initialize message...');
