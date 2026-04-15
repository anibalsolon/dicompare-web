# --- Inputs ---
acquisition_data = globals().get('acquisition_data', {})
schema_content: str = globals().get('schema_content', '')
schema_acquisition_index = globals().get('schema_acquisition_index', None)
# ---

import json
from dicompare.interface import validate_acquisition_direct

acq_data = acquisition_data if not hasattr(acquisition_data, 'to_py') else acquisition_data.to_py()
schema_str = schema_content if not hasattr(schema_content, 'to_py') else schema_content.to_py()
acq_index = schema_acquisition_index if not hasattr(schema_acquisition_index, 'to_py') else schema_acquisition_index.to_py()

results = validate_acquisition_direct(acq_data, schema_str, acq_index)
json.dumps(results, default=str)
