import fs from 'fs'
import path from 'path'
import { existsSync, rmSync } from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { GPUInfo, AvailableAccelerators, AcceleratorType, AcceleratorConfig, ReinstallProgress } from './types'
import {
  getSileroPath,
  getCoquiPath,
  getBarkPath,
  getSileroPathForAccelerator,
  getCoquiPathForAccelerator,
  setActiveAccelerator,
  AcceleratedEngine
} from './paths'
import { installSilero, installCoqui } from './installers'

const execAsync = promisify(exec)

// Check for NVIDIA GPU (CUDA support)
export async function checkNvidiaGPU(): Promise<GPUInfo> {
  try {
    // Try nvidia-smi first (most reliable)
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits', { timeout: 10000 })
    const lines = stdout.trim().split('\n')
    if (lines.length > 0 && lines[0]) {
      const [name, vramStr] = lines[0].split(',').map(s => s.trim())
      const vram = parseInt(vramStr, 10)
      return {
        available: true,
        name: name,
        vram: isNaN(vram) ? undefined : vram
      }
    }
  } catch {
    // nvidia-smi not available, try PowerShell WMI query
    try {
      const { stdout } = await execAsync(
        'powershell -Command "Get-CimInstance -ClassName Win32_VideoController | Where-Object { $_.Name -like \'*NVIDIA*\' } | Select-Object -First 1 -Property Name, AdapterRAM | ConvertTo-Json"',
        { timeout: 15000 }
      )
      const data = JSON.parse(stdout.trim())
      if (data && data.Name) {
        const vram = data.AdapterRAM ? Math.round(data.AdapterRAM / (1024 * 1024)) : undefined
        return {
          available: true,
          name: data.Name,
          vram: vram
        }
      }
    } catch {
      // No NVIDIA GPU found
    }
  }
  return { available: false }
}

// Check for AMD Radeon GPU (DirectML support on Windows)
export async function checkAmdGPU(): Promise<GPUInfo> {
  if (process.platform !== 'win32') {
    return { available: false }
  }

  try {
    const { stdout } = await execAsync(
      'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_VideoController | Where-Object Name -Match \'AMD|Radeon\' | Select-Object -First 1 -Property Name, AdapterRAM | ConvertTo-Json"',
      { timeout: 15000 }
    )
    const text = stdout.trim()
    if (!text) {
      return { available: false }
    }

    const data = JSON.parse(text)
    if (data && data.Name) {
      const vram = data.AdapterRAM ? Math.round(data.AdapterRAM / (1024 * 1024)) : undefined
      return {
        available: true,
        name: data.Name,
        vram
      }
    }
  } catch {
    // No AMD GPU found
  }

  return { available: false }
}

// Get all available accelerators
export async function getAvailableAccelerators(): Promise<AvailableAccelerators> {
  const cuda = await checkNvidiaGPU()
  const directml = await checkAmdGPU()

  // Check if required toolkit is installed
  const cudaToolkit = checkGPUToolkit('cuda')

  return {
    cpu: true,
    cuda: {
      ...cuda,
      // Mark as unavailable if GPU is present but toolkit is missing
      available: cuda.available && cudaToolkit.available,
      toolkitMissing: cuda.available && !cudaToolkit.available,
      toolkitMessage: cudaToolkit.message,
      toolkitUrl: cudaToolkit.downloadUrl
    },
    directml: {
      ...directml,
      available: directml.available,
      toolkitMissing: false
    }
  }
}

// Read current accelerator config from specific accelerator path
export function getCurrentAccelerator(engine: AcceleratedEngine): AcceleratorConfig | null {
  const basePath = engine === 'silero'
    ? getSileroPath()
    : engine === 'coqui'
      ? getCoquiPath()
      : getBarkPath()
  const configPath = path.join(basePath, 'accelerator.json')
  try {
    if (existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      return JSON.parse(content) as AcceleratorConfig
    }
  } catch {
    // Config doesn't exist or is invalid
  }
  return null
}

// Remove Silero installation for a specific accelerator
// With new structure, each accelerator has its own folder (silero-cpu, silero-cuda)
export async function removeSileroInstallation(accelerator?: AcceleratorType): Promise<void> {
  // If no accelerator specified, remove current active installation
  const sileroPath = accelerator
    ? getSileroPathForAccelerator(accelerator)
    : getSileroPath()

  if (existsSync(sileroPath)) {
    rmSync(sileroPath, { recursive: true, force: true })
    console.log(`[removeSileroInstallation] Removed: ${sileroPath}`)
  }
}

// Remove Coqui installation for a specific accelerator
// With new structure, each accelerator has its own folder (coqui-cpu, coqui-cuda)
export async function removeCoquiInstallation(accelerator?: AcceleratorType): Promise<void> {
  // If no accelerator specified, remove current active installation
  const coquiPath = accelerator
    ? getCoquiPathForAccelerator(accelerator)
    : getCoquiPath()

  if (existsSync(coquiPath)) {
    rmSync(coquiPath, { recursive: true, force: true })
    console.log(`[removeCoquiInstallation] Removed: ${coquiPath}`)
  }
}

// Check if required toolkit is installed for GPU acceleration
export function checkGPUToolkit(accelerator: AcceleratorType): { available: boolean; error?: string; message?: string; downloadUrl?: string } {
  if (accelerator === 'cpu') {
    return { available: true }
  }

  if (accelerator === 'directml') {
    if (process.platform !== 'win32') {
      return {
        available: false,
        message: 'DirectML is available only on Windows'
      }
    }
    return { available: true }
  }

  // For CUDA, check if CUDA Toolkit is installed
  if (accelerator === 'cuda') {
    const cudaPath = process.env.CUDA_PATH

    if (!cudaPath || !existsSync(cudaPath)) {
      const downloadUrl = 'https://developer.nvidia.com/cuda-downloads'
      return {
        available: false,
        message: 'Требуется NVIDIA CUDA Toolkit',
        downloadUrl,
        error: JSON.stringify({
          type: 'toolkit_missing',
          title: 'CUDA требует NVIDIA CUDA Toolkit',
          description: 'Для работы CUDA (NVIDIA GPU) необходимо установить NVIDIA CUDA Toolkit.',
          downloadUrl,
          downloadLabel: 'Скачать и установить',
          steps: [
            'Перезагрузите компьютер после установки',
            'Попробуйте установить Silero с CUDA ускорением снова'
          ],
          hint: 'Альтернатива: используйте CPU ускорение'
        })
      }
    }
  }

  return { available: true }
}

// Install or switch to Silero with specified accelerator
// With the new architecture, each accelerator has its own isolated folder
// No need to remove anything - just install to the new folder and switch
export async function reinstallSileroWithAccelerator(
  accelerator: AcceleratorType,
  onProgress: (progress: ReinstallProgress) => void
): Promise<{ success: boolean; error?: string }> {
  if (accelerator === 'directml') {
    return { success: false, error: 'DirectML acceleration is supported for Coqui XTTS-v2 only.' }
  }

  onProgress({ stage: 'installing', message: 'Устанавливаем Silero...', progress: 0 })

  // Install Silero to accelerator-specific folder (silero-cpu, silero-cuda)
  const result = await installSilero((p) => {
    onProgress({
      stage: 'installing',
      message: p.details || 'Устанавливаем...',
      progress: p.progress
    })
  }, accelerator)

  if (result.success) {
    // Set this accelerator as active
    setActiveAccelerator('silero', accelerator)
    onProgress({
      stage: 'complete',
      message: `Silero установлен с ${accelerator.toUpperCase()} ускорением!`,
      progress: 100
    })
  } else {
    onProgress({ stage: 'error', message: result.error || 'Ошибка установки' })
  }

  return result
}

// Install or switch to Coqui with specified accelerator
// With the new architecture, each accelerator has its own isolated folder
export async function reinstallCoquiWithAccelerator(
  accelerator: AcceleratorType,
  onProgress: (progress: ReinstallProgress) => void
): Promise<{ success: boolean; error?: string }> {
  onProgress({ stage: 'installing', message: 'Устанавливаем Coqui...', progress: 0 })

  // Install Coqui to accelerator-specific folder (coqui-cpu, coqui-cuda)
  const result = await installCoqui((p) => {
    onProgress({
      stage: 'installing',
      message: p.details || 'Устанавливаем...',
      progress: p.progress
    })
  }, accelerator)

  if (result.success) {
    // Set this accelerator as active
    setActiveAccelerator('coqui', accelerator)
    onProgress({
      stage: 'complete',
      message: `Coqui установлен с ${accelerator.toUpperCase()} ускорением!`,
      progress: 100
    })
  } else {
    onProgress({ stage: 'error', message: result.error || 'Ошибка установки' })
  }

  return result
}
