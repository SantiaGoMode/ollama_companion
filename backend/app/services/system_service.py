import platform
import subprocess
import os
import re


def get_system_info() -> dict:
    """Detect system hardware: chip, RAM, CPU cores, GPU info."""
    info = {
        "os": platform.system(),
        "os_version": platform.mac_ver()[0] if platform.system() == "Darwin" else platform.version(),
        "arch": platform.machine(),
        "cpu_name": "",
        "cpu_cores": os.cpu_count() or 0,
        "ram_gb": 0,
        "gpu_name": "",
        "gpu_memory_gb": 0,
        "chip": "",
        "is_apple_silicon": False,
    }

    system = platform.system()

    if system == "Darwin":
        _detect_macos(info)
    elif system == "Linux":
        _detect_linux(info)
    else:
        _detect_generic(info)

    # Compute recommended max model size (~75% of RAM for Ollama overhead)
    info["recommended_max_model_gb"] = round(info["ram_gb"] * 0.75, 1)

    return info


def _detect_macos(info: dict):
    # Total RAM
    try:
        result = subprocess.run(
            ["sysctl", "-n", "hw.memsize"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["ram_gb"] = round(int(result.stdout.strip()) / (1024 ** 3), 1)
    except Exception:
        pass

    # CPU cores
    try:
        result = subprocess.run(
            ["sysctl", "-n", "hw.ncpu"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0:
            info["cpu_cores"] = int(result.stdout.strip())
    except Exception:
        pass

    # Chip info via system_profiler
    try:
        result = subprocess.run(
            ["system_profiler", "SPHardwareDataType"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            output = result.stdout

            chip_match = re.search(r"Chip:\s*(.+)", output)
            if chip_match:
                chip = chip_match.group(1).strip()
                info["chip"] = chip
                info["cpu_name"] = chip
                info["is_apple_silicon"] = True
                # On Apple Silicon, GPU memory = system RAM (unified memory)
                info["gpu_name"] = f"{chip} GPU"
                info["gpu_memory_gb"] = info["ram_gb"]
            else:
                # Intel Mac
                cpu_match = re.search(r"Processor Name:\s*(.+)", output)
                if cpu_match:
                    info["cpu_name"] = cpu_match.group(1).strip()

                cpu_match2 = re.search(r"Chip:\s*(.+)", output)
                if not cpu_match2:
                    # Try brand string for Intel
                    try:
                        brand = subprocess.run(
                            ["sysctl", "-n", "machdep.cpu.brand_string"],
                            capture_output=True, text=True, timeout=5
                        )
                        if brand.returncode == 0 and brand.stdout.strip():
                            info["cpu_name"] = brand.stdout.strip()
                    except Exception:
                        pass

            # Memory info
            mem_match = re.search(r"Memory:\s*(\d+)\s*GB", output)
            if mem_match and info["ram_gb"] == 0:
                info["ram_gb"] = int(mem_match.group(1))
    except Exception:
        pass


def _detect_linux(info: dict):
    # RAM from /proc/meminfo
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal:"):
                    kb = int(line.split()[1])
                    info["ram_gb"] = round(kb / (1024 ** 2), 1)
                    break
    except Exception:
        pass

    # CPU info
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.startswith("model name"):
                    info["cpu_name"] = line.split(":")[1].strip()
                    break
    except Exception:
        pass

    # NVIDIA GPU
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = result.stdout.strip().split(",")
            info["gpu_name"] = parts[0].strip()
            if len(parts) > 1:
                info["gpu_memory_gb"] = round(int(parts[1].strip()) / 1024, 1)
    except Exception:
        pass


def _detect_generic(info: dict):
    info["cpu_name"] = platform.processor() or "Unknown"
