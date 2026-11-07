import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../logger.js';

function getBundledPythonPath(): string {
  // Detect installation directory based on current executable location
  let installDir = path.join(os.homedir(), 'AppData', 'Local', 'FoundryMCPServer');

  // Try to detect install directory from current process location
  const currentDir = process.cwd();
  const execDir = path.dirname(process.execPath);

  // Check if we're running from an installed location
  if (currentDir.includes('FoundryMCPServer') || execDir.includes('FoundryMCPServer')) {
    // Extract the installation directory
    const foundryMcpIndex = currentDir.indexOf('FoundryMCPServer');
    if (foundryMcpIndex !== -1) {
      installDir = currentDir.substring(0, foundryMcpIndex + 'FoundryMCPServer'.length);
    } else {
      const foundryMcpExecIndex = execDir.indexOf('FoundryMCPServer');
      if (foundryMcpExecIndex !== -1) {
        installDir = execDir.substring(0, foundryMcpExecIndex + 'FoundryMCPServer'.length);
      }
    }
  }

  // Check for nested ComfyUI installation (current actual structure)
  const nestedComfyUIPythonPath = path.join(
    installDir,
    'ComfyUI',
    'ComfyUI',
    'python_embeded',
    'python.exe'
  );
  if (fs.existsSync(nestedComfyUIPythonPath)) {
    return nestedComfyUIPythonPath;
  }

  // Check for flat ComfyUI portable installation (fallback)
  const portablePythonPath = path.join(installDir, 'ComfyUI', 'python_embeded', 'python.exe');
  if (fs.existsSync(portablePythonPath)) {
    return portablePythonPath;
  }

  // Path to bundled Python virtual environment (legacy)
  const bundledPythonPath = path.join(installDir, 'ComfyUI-env', 'Scripts', 'python.exe');

  // Check if bundled Python exists
  if (fs.existsSync(bundledPythonPath)) {
    return bundledPythonPath;
  }

  // Fallback: try alternative installation paths
  const fallbackPaths = [
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'FoundryMCPServer',
      'ComfyUI',
      'ComfyUI',
      'python_embeded',
      'python.exe'
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'FoundryMCPServer',
      'ComfyUI-headless',
      'ComfyUI',
      'python_embeded',
      'python.exe'
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'FoundryMCPServer',
      'ComfyUI',
      'python_embeded',
      'python.exe'
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'FoundryMCPServer',
      'ComfyUI-headless',
      'python_embeded',
      'python.exe'
    ),
    path.join(
      os.homedir(),
      'AppData',
      'Local',
      'FoundryMCPServer',
      'ComfyUI-env',
      'Scripts',
      'python.exe'
    ),
    path.join(process.cwd(), '..', '..', 'ComfyUI-env', 'Scripts', 'python.exe'),
    path.join(__dirname, '..', '..', '..', 'ComfyUI-env', 'Scripts', 'python.exe'),
    path.join(os.homedir(), 'AppData', 'Local', 'FoundryMCPServer', 'Python', 'python.exe'),
  ];

  for (const fallbackPath of fallbackPaths) {
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  // Final fallback to system Python (should not happen with bundled installer)
  console.error('Bundled Python not found, falling back to system Python');
  return 'python';
}

// ComfyUI Service Management

let comfyuiProcess: ChildProcess | null = null;

let comfyuiStatus: 'stopped' | 'starting' | 'running' | 'error' = 'stopped';

// ComfyUI Service Management Functions

async function findComfyUIPath(): Promise<string> {
  // Check for nested ComfyUI installation (current actual structure)

  const nestedComfyUIPath = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'FoundryMCPServer',
    'ComfyUI',
    'ComfyUI'
  );

  if (fs.existsSync(path.join(nestedComfyUIPath, 'main.py'))) {
    return nestedComfyUIPath;
  }

  // Check for legacy nested ComfyUI-headless installation (fallback)

  const nestedHeadlessPath = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'FoundryMCPServer',
    'ComfyUI-headless',
    'ComfyUI'
  );

  if (fs.existsSync(path.join(nestedHeadlessPath, 'main.py'))) {
    return nestedHeadlessPath;
  }

  // Check for flat ComfyUI installation (unlikely but possible)

  const flatPath = path.join(os.homedir(), 'AppData', 'Local', 'FoundryMCPServer', 'ComfyUI');

  if (fs.existsSync(path.join(flatPath, 'main.py'))) {
    return flatPath;
  }

  // Check for legacy flat ComfyUI-headless installation (fallback)

  const legacyFlatPath = path.join(
    os.homedir(),
    'AppData',
    'Local',
    'FoundryMCPServer',
    'ComfyUI-headless'
  );

  if (fs.existsSync(path.join(legacyFlatPath, 'main.py'))) {
    return legacyFlatPath;
  }

  throw new Error('ComfyUI installation not found');
}

async function waitForComfyUIReady(timeoutMs: number = 60000): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch('http://127.0.0.1:31411/system_stats', {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return; // ComfyUI is ready
      }
    } catch (error) {
      // Still starting up, continue polling
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('ComfyUI failed to start within timeout');
}

export async function startComfyUIService(logger: Logger): Promise<any> {
  if (comfyuiStatus === 'running') {
    return { status: 'already_running', message: 'ComfyUI service is already running' };
  }

  if (comfyuiStatus === 'starting') {
    return { status: 'starting', message: 'ComfyUI service start already in progress' };
  }

  try {
    comfyuiStatus = 'starting';

    logger.info('Starting ComfyUI service...');

    // Find ComfyUI installation

    const comfyUIPath = await findComfyUIPath();

    logger.info('ComfyUI found', { path: comfyUIPath });

    // Spawn ComfyUI process

    logger.info('Starting ComfyUI process', { path: path.join(comfyUIPath, 'main.py') });

    // Use bundled Python virtual environment
    const pythonExe = getBundledPythonPath();
    logger.info('Using bundled Python', { pythonPath: pythonExe });

    comfyuiProcess = spawn(
      pythonExe,
      [
        'main.py',

        '--port',
        '31411',

        '--listen',
        '127.0.0.1',

        '--disable-auto-launch',

        '--dont-print-server',
      ],
      {
        cwd: comfyUIPath,

        stdio: ['ignore', 'pipe', 'pipe'],

        detached: false,

        windowsHide: true, // Prevent Python console window on Windows
      }
    );

    // Handle process events

    comfyuiProcess.on('spawn', () => {
      logger.info('ComfyUI process spawned successfully');
    });

    comfyuiProcess.on('error', error => {
      logger.error('ComfyUI process error', { error: error.message });

      comfyuiStatus = 'error';
    });

    comfyuiProcess.on('exit', (code, signal) => {
      logger.info('ComfyUI process exited', { code, signal });

      comfyuiStatus = 'stopped';

      comfyuiProcess = null;
    });

    // Capture stdout/stderr for debugging

    comfyuiProcess.stdout?.on('data', data => {
      logger.debug('ComfyUI stdout', { data: data.toString().trim() });
    });

    comfyuiProcess.stderr?.on('data', data => {
      logger.debug('ComfyUI stderr', { data: data.toString().trim() });
    });

    // Wait for ComfyUI API to be ready

    await waitForComfyUIReady();

    comfyuiStatus = 'running';

    logger.info('ComfyUI service started successfully', {
      pid: comfyuiProcess.pid,

      status: comfyuiStatus,
    });

    return {
      status: 'running',

      message: 'ComfyUI service started successfully',

      pid: comfyuiProcess.pid,
    };
  } catch (error: any) {
    logger.error('ComfyUI service start failed', { error: error.message });

    comfyuiStatus = 'error';

    if (comfyuiProcess) {
      comfyuiProcess.kill();

      comfyuiProcess = null;
    }

    return {
      status: 'error',

      message: `Failed to start ComfyUI service: ${error.message}`,
    };
  }
}

export async function stopComfyUIService(logger: Logger): Promise<any> {
  if (comfyuiStatus === 'stopped') {
    return { status: 'already_stopped', message: 'ComfyUI service is already stopped' };
  }

  try {
    logger.info('Stopping ComfyUI service...');

    if (comfyuiProcess) {
      comfyuiProcess.kill('SIGTERM');

      // Wait for graceful shutdown, then force kill if needed

      await new Promise(resolve => setTimeout(resolve, 5000));

      if (comfyuiProcess && !comfyuiProcess.killed) {
        comfyuiProcess.kill('SIGKILL');
      }
    }

    comfyuiStatus = 'stopped';

    comfyuiProcess = null;

    logger.info('ComfyUI service stopped successfully');

    return { status: 'stopped', message: 'ComfyUI service stopped successfully' };
  } catch (error: any) {
    logger.error('ComfyUI service stop failed', { error: error.message });

    return { status: 'error', message: `Failed to stop ComfyUI service: ${error.message}` };
  }
}

export async function checkComfyUIStatus(): Promise<any> {
  // Always check if ComfyUI is actually responsive on port 31411
  // This handles both spawned processes and externally-started instances

  try {
    const response = await fetch('http://127.0.0.1:31411/system_stats', {
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      comfyuiStatus = 'running';
    } else {
      comfyuiStatus = 'error';
    }
  } catch (error) {
    // ComfyUI is not responsive on port 31411
    comfyuiStatus = 'stopped';
  }

  return {
    status: comfyuiStatus,

    message: getStatusMessage(comfyuiStatus),

    pid: comfyuiProcess?.pid || null,
  };
}

function getStatusMessage(status: string): string {
  const statusMessages = {
    stopped: 'ComfyUI service is not running',

    starting: 'ComfyUI service is starting...',

    running: 'ComfyUI service is running',

    error: 'ComfyUI service encountered an error',
  };

  return statusMessages[status as keyof typeof statusMessages] || 'Unknown status';
}
