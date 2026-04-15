# --- Inputs ---
PACKAGE_SOURCE: str = globals().get('PACKAGE_SOURCE', 'dicompare')
# ---

import micropip

# PACKAGE_SOURCE is set as a pyodide global by the caller
await micropip.install(PACKAGE_SOURCE)

import dicompare
import dicompare.interface
import dicompare.validation
import dicompare.schema
import dicompare.io
import json
from typing import List, Dict, Any

print("[Worker] dicompare modules imported successfully")
