import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { spawn } from 'child_process'
import { promisify } from 'util'
import { exec } from 'child_process'
import type { PipProgressInfo } from './types'

const execAsync = promisify(exec)

// Run pip install with real-time progress tracking
export async function runPipWithProgress(
  pythonPath: string,
  packages: string,
  options: {
    indexUrl?: string
    timeout?: number
    msvcEnvPath?: string // Path to vcvarsall.bat for MSVC environment
    extraArgs?: string[] // Additional pip arguments like --prefer-binary
    targetDir?: string // Target directory for installation (for embedded Python)
    onProgress?: (info: PipProgressInfo) => void
    onOutput?: (line: string) => void
  } = {}
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    let command: string
    let spawnArgs: string[]

    // Note: --progress-bar was removed in newer pip versions, pip shows progress by default
    const pipArgs = ['pip', 'install', '--no-input']

    if (options.indexUrl) {
      pipArgs.push('--index-url', options.indexUrl)
    }

    if (options.targetDir) {
      pipArgs.push('--target', options.targetDir)
    }

    if (options.extraArgs) {
      pipArgs.push(...options.extraArgs)
    }

    // Add packages (split by space, filter out empty strings)
    pipArgs.push(...packages.split(' ').filter(p => p.trim()))

    // Build environment with Python include/libs paths for C extension compilation
    const env: Record<string, string | undefined> = { ...process.env, PYTHONIOENCODING: 'utf-8' }

    // Get Python directory (parent of python.exe)
    const pythonDir = path.dirname(pythonPath)
    const pythonIncludePath = path.join(pythonDir, 'include')
    const pythonLibsPath = path.join(pythonDir, 'libs')

    // Add Python include and libs to environment if they exist (for compiling C extensions)
    if (existsSync(pythonIncludePath) && existsSync(pythonLibsPath)) {
      // Append to INCLUDE and LIB environment variables
      env.INCLUDE = env.INCLUDE ? `${pythonIncludePath};${env.INCLUDE}` : pythonIncludePath
      env.LIB = env.LIB ? `${pythonLibsPath};${env.LIB}` : pythonLibsPath
      console.log(`[runPipWithProgress] Added Python paths: INCLUDE=${pythonIncludePath}, LIB=${pythonLibsPath}`)
    }

    if (options.msvcEnvPath) {
      // Run pip within MSVC environment
      // Set INCLUDE and LIB after vcvarsall to preserve them
      command = 'cmd.exe'
      const pipCommand = `"${pythonPath}" -m ${pipArgs.join(' ')}`

      // Build environment setup commands for Python headers
      let envSetup = ''
      if (existsSync(pythonIncludePath) && existsSync(pythonLibsPath)) {
        // Set INCLUDE and LIB after vcvarsall to ensure they're included
        envSetup = ` && set "INCLUDE=${pythonIncludePath};%INCLUDE%" && set "LIB=${pythonLibsPath};%LIB%"`
      }

      spawnArgs = ['/c', `call "${options.msvcEnvPath}" x64 >nul 2>&1${envSetup} && ${pipCommand}`]
      console.log('[runPipWithProgress] MSVC command:', spawnArgs.join(' '))
    } else {
      command = pythonPath
      spawnArgs = ['-m', ...pipArgs]
      console.log('[runPipWithProgress] command:', command, spawnArgs.join(' '))
    }

    const proc = spawn(command, spawnArgs, {
      shell: true, // Always use shell for proper command parsing
      env
    })

    let lastPackage = ''
    let stderr = ''
    let lastActivityTime = Date.now()
    let currentPhase: PipProgressInfo['phase'] = 'collecting'

    // Keepalive interval - sends progress updates during long silent operations (like compilation)
    const keepaliveInterval = setInterval(() => {
      const silentSeconds = Math.round((Date.now() - lastActivityTime) / 1000)
      if (silentSeconds > 5 && options.onProgress) {
        // During compilation/building, pip is silent for long periods
        const isCompiling = currentPhase === 'processing'
        const details = isCompiling
          ? `Compiling ${lastPackage || 'packages'}... (${silentSeconds}s)`
          : `Working on ${lastPackage || 'packages'}... (${silentSeconds}s)`
        options.onProgress({
          phase: currentPhase,
          package: lastPackage || 'packages'
        })
        console.log(`[runPipWithProgress] Keepalive: ${details}`)
      }
    }, 5000)

    const clearKeepalive = () => {
      clearInterval(keepaliveInterval)
    }

    const parseProgressLine = (line: string) => {
      // pip progress format: "Downloading package-1.0.0.whl (123.4 MB)" or percentage updates
      // Also: "Downloading torch-2.0.0+cpu... 50%|█████     | 123/246 [00:30<00:30, 4.0MB/s]"

      // Update activity time on any output
      lastActivityTime = Date.now()

      if (options.onOutput) {
        options.onOutput(line)
      }

      // Match "Collecting package"
      const collectMatch = line.match(/Collecting\s+(\S+)/)
      if (collectMatch) {
        lastPackage = collectMatch[1].split('[')[0].split('>')[0].split('<')[0].split('=')[0]
        currentPhase = 'collecting'
        options.onProgress?.({
          phase: 'collecting',
          package: lastPackage
        })
        return
      }

      // Match "Downloading package (size)" - extract package name from URL or filename
      const downloadStartMatch = line.match(/Downloading\s+(\S+)/)
      if (downloadStartMatch) {
        let packageName = downloadStartMatch[1]
        // If it's a URL, extract the filename and parse package name from it
        if (packageName.startsWith('http://') || packageName.startsWith('https://')) {
          // Extract filename from URL path (last segment)
          const urlPath = packageName.split('/').pop() || packageName
          // Parse package name from wheel/archive filename (e.g., torch-2.5.1-cp311-win_amd64.whl -> torch)
          packageName = urlPath.split('-')[0]
        } else {
          // Regular package name, strip version specifiers
          packageName = packageName.split('-')[0]
        }
        lastPackage = packageName
        currentPhase = 'downloading'
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage
        })
        return
      }

      // Match pip download progress with size: "50%|█████| 100.5/200.0 MB" or just "100.5/200.0 MB"
      // Also handles: "123.4/456.7 MB", "1.2/2.5 GB", "500/1024 kB"
      const sizeMatch = line.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(MB|kB|GB|M|G|k)/i)
      const percentMatch = line.match(/(\d+)%\|/)

      if (sizeMatch) {
        const unit = sizeMatch[3].toLowerCase()
        const multiplier = (unit === 'gb' || unit === 'g') ? 1024 : (unit === 'mb' || unit === 'm') ? 1 : 0.001
        const downloaded = parseFloat(sizeMatch[1]) * multiplier
        const total = parseFloat(sizeMatch[2]) * multiplier
        currentPhase = 'downloading'
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage,
          downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100)
        })
        return
      }

      // Fallback: Match percentage only if no size info available
      if (percentMatch) {
        currentPhase = 'downloading'
        options.onProgress?.({
          phase: 'downloading',
          package: lastPackage,
          percentage: parseInt(percentMatch[1], 10)
        })
        return
      }

      // Match "Installing collected packages"
      if (line.includes('Installing collected packages')) {
        currentPhase = 'installing'
        options.onProgress?.({
          phase: 'installing',
          package: lastPackage
        })
        return
      }

      // Match "Successfully installed"
      if (line.includes('Successfully installed')) {
        currentPhase = 'processing'
        options.onProgress?.({
          phase: 'processing',
          package: 'complete',
          percentage: 100
        })
        return
      }

      // Match "Building wheel" for compilation progress
      const buildMatch = line.match(/Building wheel for (\S+)/)
      if (buildMatch) {
        lastPackage = buildMatch[1]
        currentPhase = 'processing'
        options.onProgress?.({
          phase: 'processing',
          package: lastPackage
        })
        return
      }
    }

    // Buffer for incomplete lines
    let stdoutBuffer = ''
    let stderrBuffer = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString()
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''
      lines.forEach(parseProgressLine)
    })

    proc.stderr?.on('data', (data: Buffer) => {
      const str = data.toString()
      stderr += str
      stderrBuffer += str
      const lines = stderrBuffer.split(/\r?\n/)
      stderrBuffer = lines.pop() || ''
      // pip often outputs progress to stderr
      lines.forEach(parseProgressLine)
    })

    const timeout = options.timeout || 86400000 // 24 hours
    const timeoutId = setTimeout(() => {
      clearKeepalive()
      proc.kill()
      resolve({ success: false, error: `Installation timeout after ${timeout / 1000} seconds` })
    }, timeout)

    proc.on('close', (code) => {
      clearTimeout(timeoutId)
      clearKeepalive()
      // Process remaining buffer
      if (stdoutBuffer) parseProgressLine(stdoutBuffer)
      if (stderrBuffer) parseProgressLine(stderrBuffer)

      if (code === 0) {
        resolve({ success: true })
      } else {
        console.error('[runPipWithProgress] pip failed with code:', code)
        console.error('[runPipWithProgress] stderr:', stderr.slice(-2000)) // Last 2000 chars
        resolve({ success: false, error: stderr || `pip exited with code ${code}` })
      }
    })

    proc.on('error', (err) => {
      clearTimeout(timeoutId)
      clearKeepalive()
      resolve({ success: false, error: err.message })
    })
  })
}

// Download file with progress tracking
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const protocol = urlObj.protocol === 'https:' ? https : http

    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Book-to-MP3/1.0'
      }
    }, (response) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 303 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          // Handle relative redirect URLs by resolving against the original URL
          const absoluteRedirectUrl = new URL(redirectUrl, url).href
          downloadFile(absoluteRedirectUrl, destPath, onProgress).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: Failed to download ${url}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      console.log(`[downloadFile] Starting download: ${url}, size: ${totalSize} bytes`)
      let downloadedSize = 0

      // Throttle progress updates to avoid UI flickering
      let lastProgressUpdate = 0
      const PROGRESS_THROTTLE_MS = 100 // Update at most every 100ms
      let lastReportedPercent = -1

      // Ensure directory exists
      const dir = path.dirname(destPath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      const fileStream = createWriteStream(destPath)

      // Live timeout - resets on each data chunk received
      const IDLE_TIMEOUT = 3600000 // 1 hour without data = timeout
      let timeoutId: NodeJS.Timeout | null = null

      const resetTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
          request.destroy()
          if (existsSync(destPath)) {
            unlinkSync(destPath)
          }
          reject(new Error('Download timeout - no data received for 30 seconds'))
        }, IDLE_TIMEOUT)
      }

      const clearTimeoutHandler = () => {
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
      }

      // Start the timeout
      resetTimeout()

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length
        resetTimeout() // Reset timeout on each chunk

        if (onProgress && totalSize > 0) {
          const now = Date.now()
          const currentPercent = Math.round((downloadedSize / totalSize) * 100)

          // Only update if enough time passed OR if percentage changed by at least 1%
          // Always update at 100%
          if (
            downloadedSize >= totalSize ||
            (now - lastProgressUpdate >= PROGRESS_THROTTLE_MS && currentPercent !== lastReportedPercent)
          ) {
            lastProgressUpdate = now
            lastReportedPercent = currentPercent
            onProgress(downloadedSize, totalSize)
          }
        }
      })

      response.pipe(fileStream)

      fileStream.on('finish', () => {
        clearTimeoutHandler()
        fileStream.close()
        // Final progress update to ensure we report 100%
        if (onProgress && totalSize > 0) {
          onProgress(totalSize, totalSize)
        }
        // Verify download completed fully
        if (totalSize > 0 && downloadedSize < totalSize) {
          if (existsSync(destPath)) {
            unlinkSync(destPath)
          }
          reject(new Error(`Download incomplete: got ${downloadedSize} bytes, expected ${totalSize} bytes`))
          return
        }
        resolve()
      })

      fileStream.on('error', (err) => {
        clearTimeoutHandler()
        // Clean up partial file
        if (existsSync(destPath)) {
          unlinkSync(destPath)
        }
        reject(err)
      })
    })

    request.on('error', (err) => {
      reject(err)
    })
  })
}

// Extract ZIP file using adm-zip (more reliable than PowerShell on Windows)
export async function extractZip(zipPath: string, destPath: string): Promise<void> {
  if (!existsSync(destPath)) {
    mkdirSync(destPath, { recursive: true })
  }

  // Use adm-zip for reliable extraction
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(destPath, true) // true = overwrite
}

// Generate.py script content for Silero
export function getGenerateScriptContent(): string {
  return `#!/usr/bin/env python3
"""
Silero TTS Generation Script
Generates speech audio using Silero models
"""

import argparse
import os
import sys
import re
from pathlib import Path

try:
    import torch
except ImportError:
    print("Error: PyTorch not installed.", file=sys.stderr)
    print("Please install: pip install torch", file=sys.stderr)
    sys.exit(1)

try:
    import scipy.io.wavfile as wavfile
    import numpy as np
    from scipy import signal
except ImportError:
    print("Error: scipy/numpy not installed.", file=sys.stderr)
    print("Please install: pip install scipy numpy", file=sys.stderr)
    sys.exit(1)


def parse_rate(rate_str):
    """Parse rate string like '+50%' or '-25%' to a multiplier."""
    if not rate_str:
        return 1.0
    match = re.match(r'^([+-])(\\d+)%$', rate_str)
    if match:
        sign = match.group(1)
        percent = int(match.group(2))
        if sign == '+':
            return 1.0 + percent / 100
        else:
            return 1.0 - percent / 100
    return 1.0


def change_speed(audio, speed_factor):
    """Change audio speed by resampling."""
    if speed_factor == 1.0:
        return audio
    # Resample to change speed (higher speed = shorter audio)
    new_length = int(len(audio) / speed_factor)
    return signal.resample(audio, new_length)


def main():
    parser = argparse.ArgumentParser(description='Generate speech using Silero TTS')
    parser.add_argument('--text', required=True, help='Text to convert to speech')
    parser.add_argument('--speaker', required=True, help='Speaker model (e.g., v3_1_ru/aidar)')
    parser.add_argument('--output', required=True, help='Output WAV file path')
    parser.add_argument('--sample-rate', type=int, default=48000, help='Sample rate (default: 48000)')
    parser.add_argument('--rate', type=str, default='', help='Speed adjustment (e.g., +50%, -25%)')

    args = parser.parse_args()

    try:
        # Parse speaker path
        parts = args.speaker.split('/')
        if len(parts) != 2:
            raise ValueError(f"Invalid speaker path format: {args.speaker}")

        model_id = parts[0]  # e.g., 'v5_ru' or 'v3_en'
        speaker = parts[1]    # e.g., 'aidar', 'baya', etc.

        # Determine language
        if 'ru' in model_id:
            language = 'ru'
            model_name = 'v5_ru'
        elif 'en' in model_id:
            language = 'en'
            model_name = 'v3_en'
        else:
            raise ValueError(f"Unknown language in model: {model_id}")

        print(f"Loading Silero model: {model_name}, speaker: {speaker}", file=sys.stderr)

        # Load Silero model from torch hub
        device = torch.device('cpu')  # Use CPU for compatibility

        # Load model
        model, example_text = torch.hub.load(
            repo_or_dir='snakers4/silero-models',
            model='silero_tts',
            language=language,
            speaker=model_name
        )

        model.to(device)

        print(f"Generating audio for text length: {len(args.text)} characters", file=sys.stderr)

        # Generate audio with auto-stress and yo placement for Russian
        audio = model.apply_tts(
            text=args.text,
            speaker=speaker,
            sample_rate=args.sample_rate,
            put_accent=True,
            put_yo=True
        )

        # Save to WAV file
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Convert to numpy array
        if isinstance(audio, torch.Tensor):
            audio = audio.numpy()

        # Ensure 1D array for mono
        if audio.ndim > 1:
            audio = audio.squeeze()

        # Apply speed change if specified
        speed_factor = parse_rate(args.rate)
        if speed_factor != 1.0:
            print(f"Applying speed factor: {speed_factor}", file=sys.stderr)
            audio = change_speed(audio, speed_factor)

        # Normalize to int16 range
        audio = (audio * 32767).astype(np.int16)

        # Save using scipy
        wavfile.write(str(output_path), args.sample_rate, audio)

        print(f"Successfully generated audio: {args.output}", file=sys.stderr)
        return 0

    except Exception as e:
        print(f"Error generating audio: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
`
}

// Coqui generate script content
export function getCoquiGenerateScriptContent(): string {
  return `#!/usr/bin/env python3
"""Coqui XTTS-v2 TTS Generation Script with built-in speakers"""

import argparse
import os
import sys
from pathlib import Path

os.environ["COQUI_TOS_AGREED"] = "1"

# Fix for PyTorch 2.6+ weights_only default change
import torch
_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load
torch.inference_mode = torch.no_grad

def select_device():
    try:
        import torch_directml
        count = torch_directml.device_count() if hasattr(torch_directml, "device_count") else 1
        selected_index = 0
        selected_name = torch_directml.device_name(0)
        for index in range(count):
            name = torch_directml.device_name(index)
            if "AMD" in name.upper() or "RADEON" in name.upper():
                selected_index = index
                selected_name = name
                break
        dml_device = torch_directml.device(selected_index)
        probe = torch.ones((8, 8), device=dml_device)
        _ = probe + probe
        if "AMD" in selected_name.upper() or "RADEON" in selected_name.upper():
            print(f"Using DirectML device: {selected_name}", file=sys.stderr)
            return dml_device
    except Exception as e:
        print(f"DirectML unavailable: {e}", file=sys.stderr)

    return "cuda" if torch.cuda.is_available() else "cpu"

def prepare_text_for_xtts(text):
    text = " ".join(str(text).split())
    for mark in [",", ";", ":"]:
        if text.endswith(mark):
            text = text[:-1] + "."
            break
    if text and text[-1] not in ".!?…":
        text += "."
    return text

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--text', required=True)
    parser.add_argument('--speaker', required=True, help='Built-in speaker name (e.g., "Claribel Dervla")')
    parser.add_argument('--language', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    from TTS.api import TTS

    # Normalize language code (app uses ru-RU, XTTS uses ru)
    lang = args.language.lower()
    if lang in ['ru-ru', 'ru_ru']:
        lang = 'ru'
    elif lang in ['en-us', 'en-gb', 'en_us', 'en_gb', 'en']:
        lang = 'en'

    device = select_device()
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)

    Path(args.output).parent.mkdir(parents=True, exist_ok=True)

    tts.tts_to_file(
        text=prepare_text_for_xtts(args.text),
        speaker=args.speaker,
        language=lang,
        file_path=args.output
    )

    print(f"Audio saved to {args.output}")

if __name__ == "__main__":
    main()
`
}

// TTS Server script content - Universal server for Silero and Coqui
export function getTTSServerScriptContent(): string {
  return `#!/usr/bin/env python3
"""Universal TTS Server for Silero and Coqui XTTS"""

import argparse, gc, io, os, sys, re, threading, time
from pathlib import Path

os.environ["COQUI_TOS_AGREED"] = "1"

try:
    from flask import Flask, request, jsonify, Response
    import torch
    import psutil
    import scipy.io.wavfile as wavfile
    import numpy as np
    from scipy import signal
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    sys.exit(1)

_orig_load = torch.load
def _patched_load(*a, **kw):
    if 'weights_only' not in kw:
        kw['weights_only'] = False
    return _orig_load(*a, **kw)
torch.load = _patched_load
torch.inference_mode = torch.no_grad

app = Flask(__name__)
models = {"silero": {"ru": None, "en": None}, "coqui": None}
coqui_lock = threading.Lock()
ruaccent_model = None

def load_ruaccent():
    """Lazy load ruaccent model for Russian stress placement."""
    global ruaccent_model
    if ruaccent_model is None:
        try:
            from ruaccent import RUAccent
            ruaccent_model = RUAccent()
            ruaccent_model.load(omograph_model_size='turbo', use_dictionary=True)
            print("ruaccent model loaded successfully", file=sys.stderr)
        except ImportError:
            print("ruaccent not installed, stress placement disabled", file=sys.stderr)
            return None
        except Exception as e:
            print(f"Failed to load ruaccent: {e}", file=sys.stderr)
            return None
    return ruaccent_model

def apply_stress_marks(text, lang):
    """Apply Russian stress marks to text if ruaccent is available and lang is Russian."""
    if lang not in ['ru', 'ru-ru', 'ru_ru']:
        return text
    model = load_ruaccent()
    if model is None:
        return text
    try:
        return model.process_all(text)
    except Exception as e:
        print(f"ruaccent processing failed: {e}", file=sys.stderr)
        return text

def detect_device():
    """Detect best available compute device. Priority: CUDA > DirectML > CPU"""
    device_info = {"device": "cpu", "device_label": "cpu", "backend": "cpu", "gpu_name": None}

    # Try CUDA (NVIDIA)
    if torch.cuda.is_available():
        try:
            device_info = {
                "device": "cuda",
                "device_label": "cuda",
                "backend": "cuda",
                "gpu_name": torch.cuda.get_device_name(0)
            }
            return device_info
        except:
            pass

    # Try DirectML (AMD Radeon on Windows)
    try:
        import torch_directml
        count = torch_directml.device_count() if hasattr(torch_directml, "device_count") else 1
        selected_index = 0
        selected_name = torch_directml.device_name(0)
        for index in range(count):
            name = torch_directml.device_name(index)
            if "AMD" in name.upper() or "RADEON" in name.upper():
                selected_index = index
                selected_name = name
                break
        dml_device = torch_directml.device(selected_index)
        probe = torch.ones((8, 8), device=dml_device)
        _ = probe + probe
        if "AMD" in selected_name.upper() or "RADEON" in selected_name.upper():
            device_info = {
                "device": dml_device,
                "device_label": f"directml:{selected_index}",
                "backend": "directml",
                "gpu_name": selected_name
            }
            return device_info
    except Exception:
        pass

    return device_info

_device_info = detect_device()
device = _device_info["device"]
device_label = _device_info["device_label"]
backend = _device_info["backend"]
gpu_name = _device_info["gpu_name"]
print(f"Using device: {device_label}, backend: {backend}, GPU: {gpu_name}", file=sys.stderr)

def get_memory_gb():
    return psutil.Process().memory_info().rss / (1024**3)

def parse_rate(rate_str):
    if not rate_str:
        return 1.0
    m = re.match(r'^([+-])(\\d+)%$', str(rate_str))
    if m:
        return 1.0 + int(m.group(2)) / 100 if m.group(1) == '+' else 1.0 - int(m.group(2)) / 100
    try:
        return float(rate_str)
    except Exception:
        return 1.0

def change_speed(audio, factor):
    return audio if factor == 1.0 else signal.resample(audio, int(len(audio) / factor))

def audio_to_wav_bytes(audio, sr=48000):
    if isinstance(audio, torch.Tensor):
        audio = audio.numpy()
    if audio.ndim > 1:
        audio = audio.squeeze()
    buf = io.BytesIO()
    wavfile.write(buf, sr, (audio * 32767).astype(np.int16))
    buf.seek(0)
    return buf.read()

def load_silero_model(lang):
    global models
    model_name = 'v5_ru' if lang == 'ru' else 'v3_en'
    print(f"Loading Silero {model_name}...", file=sys.stderr)
    model, _ = torch.hub.load('snakers4/silero-models', 'silero_tts', language=lang, speaker=model_name)
    silero_device = torch.device("cpu") if backend == "directml" else torch.device(device)
    model.to(silero_device)
    models["silero"][lang] = model
    print(f"Silero {lang} loaded on {device}. Memory: {get_memory_gb():.2f} GB", file=sys.stderr)

def generate_silero(text, speaker, lang, rate=1.0, sr=48000):
    if models["silero"].get(lang) is None:
        raise RuntimeError(f"Silero model for '{lang}' is not loaded. Please load it first.")
    model = models["silero"][lang]
    spk = speaker.split('/')[-1] if '/' in speaker else speaker
    audio = model.apply_tts(text=text, speaker=spk, sample_rate=sr, put_accent=True, put_yo=True)
    if isinstance(audio, torch.Tensor):
        audio = audio.numpy()
    if audio.ndim > 1:
        audio = audio.squeeze()
    factor = parse_rate(rate) if isinstance(rate, str) else rate
    if factor != 1.0:
        audio = change_speed(audio, factor)
    return audio_to_wav_bytes(audio, sr)

def load_coqui_model():
    global models
    print("Loading Coqui XTTS-v2...", file=sys.stderr)
    from TTS.api import TTS
    models["coqui"] = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    print(f"Coqui loaded on {device_label}. Memory: {get_memory_gb():.2f} GB", file=sys.stderr)

def prepare_text_for_xtts(text):
    text = " ".join(str(text).split())
    for mark in [",", ";", ":"]:
        if text.endswith(mark):
            text = text[:-1] + "."
            break
    if text and text[-1] not in ".!?…":
        text += "."
    return text

def generate_coqui(text, speaker, lang):
    text = prepare_text_for_xtts(text)
    l = lang.lower()
    if l in ['ru-ru', 'ru_ru']:
        l = 'ru'
    elif l in ['en-us', 'en-gb', 'en_us', 'en_gb']:
        l = 'en'
    with coqui_lock:
        if models["coqui"] is None:
            raise RuntimeError("Coqui model is not loaded. Please load it first.")
        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            tmp = f.name
        try:
            models["coqui"].tts_to_file(text=text, speaker=speaker, language=l, file_path=tmp)
            with open(tmp, 'rb') as f:
                return f.read()
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)

@app.route("/status", methods=["GET"])
def status():
    return jsonify({
        "silero": {"ru_loaded": models["silero"]["ru"] is not None, "en_loaded": models["silero"]["en"] is not None},
        "coqui": {"loaded": models["coqui"] is not None},
        "memory_gb": round(get_memory_gb(), 2),
        "device": device_label,
        "backend": backend,
        "gpu_name": gpu_name,
        "preferred_device": device_label,
        "available_devices": [
            {"id": "cpu", "name": "CPU", "available": True, "description": "Central Processing Unit"},
            {"id": device_label, "name": gpu_name or backend.upper(), "available": backend != "cpu", "description": backend.upper()}
        ]
    })

@app.route("/load", methods=["POST"])
def load_model():
    data = request.json or {}
    engine, lang = data.get("engine"), data.get("language", "ru")
    if not engine:
        return jsonify({"error": "Missing engine"}), 400
    try:
        if engine == "silero" and models["silero"].get(lang) is None:
            load_silero_model(lang)
        elif engine == "coqui" and models["coqui"] is None:
            load_coqui_model()
        return jsonify({"success": True, "memory_gb": round(get_memory_gb(), 2)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/unload", methods=["POST"])
def unload_model():
    data = request.json or {}
    engine, lang = data.get("engine"), data.get("language")
    if engine == "silero":
        if lang:
            models["silero"][lang] = None
        else:
            models["silero"] = {"ru": None, "en": None}
    elif engine == "coqui":
        models["coqui"] = None
    elif engine == "all":
        models["silero"] = {"ru": None, "en": None}
        models["coqui"] = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    return jsonify({"success": True, "memory_gb": round(get_memory_gb(), 2)})

@app.route("/generate", methods=["POST"])
def generate():
    data = request.json or {}
    engine, text, speaker = data.get("engine"), data.get("text"), data.get("speaker")
    lang, rate = data.get("language", "ru"), data.get("rate", 1.0)
    use_ruaccent = data.get("use_ruaccent", False)
    if not all([engine, text, speaker]):
        return jsonify({"error": "Missing params"}), 400
    try:
        # Apply ruaccent stress marks only for Silero (not for Coqui)
        processed_text = apply_stress_marks(text, lang) if (engine == "silero" and use_ruaccent) else text
        audio = generate_silero(processed_text, speaker, lang, rate) if engine == "silero" else generate_coqui(text, speaker, lang)
        return Response(audio, mimetype="audio/wav")
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        error_msg = str(e) or repr(e) or "Unknown error occurred"
        return jsonify({"error": error_msg}), 500

@app.route("/shutdown", methods=["POST"])
def shutdown():
    global models
    models = {"silero": {"ru": None, "en": None}, "coqui": None}
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    threading.Thread(target=lambda: (time.sleep(0.5), os._exit(0))).start()
    return jsonify({"success": True})

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--port", type=int, default=5050)
    p.add_argument("--host", type=str, default="127.0.0.1")
    args = p.parse_args()
    print(f"TTS Server on {args.host}:{args.port}, device={device_label}", file=sys.stderr)
    app.run(host=args.host, port=args.port, threaded=True)
`
}

// Find vcvarsall.bat path for setting up MSVC environment
export async function findVcvarsallPath(): Promise<string | null> {
  const checkVcvarsall = (basePath: string): string | null => {
    const vcvarsallPath = path.join(basePath, 'VC', 'Auxiliary', 'Build', 'vcvarsall.bat')
    if (existsSync(vcvarsallPath)) {
      return vcvarsallPath
    }
    return null
  }

  const vswherePaths = [
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe',
    'C:\\Program Files\\Microsoft Visual Studio\\Installer\\vswhere.exe'
  ]

  for (const vswherePath of vswherePaths) {
    if (existsSync(vswherePath)) {
      try {
        const { stdout } = await execAsync(
          `"${vswherePath}" -latest -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`,
          { timeout: 10000 }
        )
        if (stdout.trim()) {
          const vcvarsall = checkVcvarsall(stdout.trim())
          if (vcvarsall) return vcvarsall
        }
      } catch {
        // Continue to fallback
      }
    }
  }

  const possibleVsPaths = [
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional',
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Enterprise',
    'C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools',
    'C:\\Program Files\\Microsoft Visual Studio\\2019\\BuildTools',
  ]

  for (const vsPath of possibleVsPaths) {
    const vcvarsall = checkVcvarsall(vsPath)
    if (vcvarsall) return vcvarsall
  }

  return null
}
