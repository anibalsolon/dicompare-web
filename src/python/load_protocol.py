# --- Inputs ---
_protocol_base64: str = globals().get('_protocol_base64', '')
_protocol_filename: str = globals().get('_protocol_filename', '')
_protocol_type: str = globals().get('_protocol_type', '')
# ---

import json
import base64
from dicompare.interface import load_protocol_for_ui

file_bytes = base64.b64decode(_protocol_base64)
file_name = _protocol_filename
file_type = _protocol_type

acquisitions = load_protocol_for_ui(file_bytes, file_name, file_type)
json.dumps(acquisitions, default=str)
