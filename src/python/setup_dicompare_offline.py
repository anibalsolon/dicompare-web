# --- Inputs ---
WHEEL_BASE: str = globals().get('WHEEL_BASE', '')
PACKAGE_SOURCE: str = globals().get('PACKAGE_SOURCE', 'dicompare')
# ---

import micropip

# Install bundled wheels for offline use with absolute file:// URLs
# WHEEL_BASE and PACKAGE_SOURCE are set as pyodide globals by the caller
wheels_to_install = [
    WHEEL_BASE + 'pydicom-2.4.4-py3-none-any.whl',
    WHEEL_BASE + 'tabulate-0.9.0-py3-none-any.whl',
    WHEEL_BASE + 'nibabel-5.3.3-py3-none-any.whl',
    WHEEL_BASE + 'twixtools-0.24-py3-none-any.whl',
    PACKAGE_SOURCE,
]

for wheel in wheels_to_install:
    try:
        await micropip.install(wheel)
        print(f"[Worker] Installed {wheel}")
    except Exception as e:
        print(f"[Worker] Warning: Could not install {wheel}: {e}")

import dicompare
import dicompare.interface
import dicompare.validation
import dicompare.schema
import dicompare.io
import json
from typing import List, Dict, Any

print("[Worker] dicompare modules imported successfully")
