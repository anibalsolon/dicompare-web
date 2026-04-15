# --- Inputs ---
_ui_acquisitions_json: str = globals().get('_ui_acquisitions_json', '[]')
_schema_metadata_json: str = globals().get('_schema_metadata_json', '{}')
# ---

import json
from dicompare.interface import build_schema_from_ui_acquisitions

acqs = json.loads(_ui_acquisitions_json)
meta = json.loads(_schema_metadata_json)

schema = build_schema_from_ui_acquisitions(acqs, meta)
json.dumps(schema, default=str)
