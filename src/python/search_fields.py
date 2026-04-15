# --- Inputs ---
_search_query: str = globals().get('_search_query', '')
_search_limit: int = globals().get('_search_limit', 10)
# ---

import json
from dicompare.interface import search_dicom_dictionary

results = search_dicom_dictionary(_search_query, _search_limit)
json.dumps(results, default=str)
