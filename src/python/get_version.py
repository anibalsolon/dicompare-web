# --- Inputs ---
DICOMPARE_VERSION: str = globals().get('DICOMPARE_VERSION', 'unknown')
# ---

import json
import sys
import dicompare

# DICOMPARE_VERSION is set as a pyodide global by the caller
json.dumps({
    'pyodide': '.'.join(map(str, sys.version_info[:3])),
    'dicompare': getattr(dicompare, '__version__', DICOMPARE_VERSION)
})
