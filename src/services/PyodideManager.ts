import { DICOMPARE_VERSION } from '../version';
import setupDicompareOnline from '../python/setup_dicompare_online.py';

// Load Pyodide from CDN instead of bundling

export interface PyodideInstance {
  runPython: (code: string) => any;
  runPythonAsync: (code: string) => Promise<any>;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
  loadPackage: (packages: string | string[]) => Promise<void>;
}

class PyodideManager {
  private pyodide: PyodideInstance | null = null;
  private isLoading = false;
  private loadPromise: Promise<PyodideInstance> | null = null;

  async initialize(): Promise<PyodideInstance> {
    if (this.pyodide) {
      return this.pyodide;
    }

    if (this.isLoading && this.loadPromise) {
      return this.loadPromise;
    }

    this.isLoading = true;
    this.loadPromise = this.loadPyodide();
    
    try {
      this.pyodide = await this.loadPromise;
      return this.pyodide;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadPyodide(): Promise<PyodideInstance> {
    console.log('🐍 Initializing Pyodide...');
    const startTime = Date.now();

    // Load Pyodide from CDN
    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/',
    });

    const loadTime = Date.now() - startTime;
    console.log(`🐍 Pyodide loaded in ${loadTime}ms`);

    // Install and load the real dicompare package
    await this.setupRealDicompare(pyodide);

    return pyodide;
  }

  private async setupRealDicompare(pyodide: PyodideInstance): Promise<void> {
    console.log('📦 Installing real dicompare package...');

    // Install the real dicompare wheel from local CORS server
    // Note: sqlite3 is unvendored in Pyodide and must be loaded explicitly
    await pyodide.loadPackage(['micropip', 'sqlite3']);

    // Auto-detect environment: use local package in development, PyPI in production
    // Note: Only use Vite's DEV flag, not hostname detection (localhost is used in production containers too)
    const isDevelopment = import.meta.env.DEV;

    const packageSource = isDevelopment
      ? `http://localhost:8000/dist/dicompare-0.0.0-py3-none-any.whl`
      : `dicompare==${DICOMPARE_VERSION}`;

    console.log(`📦 Installing dicompare from ${isDevelopment ? 'local development server' : 'PyPI'}...`);

    pyodide.globals.set('PACKAGE_SOURCE', packageSource);
    await pyodide.runPythonAsync(setupDicompareOnline);

    console.log('✅ Real dicompare package installed and imported');
  }

  isInitialized(): boolean {
    return this.pyodide !== null;
  }

  async runPython(code: string): Promise<any> {
    const pyodide = await this.initialize();
    return pyodide.runPython(code);
  }

  async setGlobal(name: string, value: any): Promise<void> {
    const pyodide = await this.initialize();
    pyodide.globals.set(name, value);
  }

  async loadPackage(packages: string | string[]): Promise<void> {
    const pyodide = await this.initialize();
    return pyodide.loadPackage(packages);
  }

  async runPythonAsync(code: string): Promise<any> {
    const pyodide = await this.initialize();
    // For async Python code, we need to wrap it in an async function and use runPythonAsync
    const wrappedCode = `
import asyncio

async def __main__():
${code.split('\n').map(line => '    ' + line).join('\n')}

# Run the async function
await __main__()
    `;
    return await pyodide.runPythonAsync(wrappedCode);
  }

  async setPythonGlobal(name: string, value: any): Promise<void> {
    const pyodide = await this.initialize();
    pyodide.globals.set(name, value);
  }
}

// Create singleton instance
export const pyodideManager = new PyodideManager();
