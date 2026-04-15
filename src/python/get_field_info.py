# --- Inputs ---
_field_or_tag: str = globals().get('_field_or_tag', '')
# ---

import json
from dicompare import get_tag_info

info = get_tag_info(_field_or_tag)
json.dumps(info, default=str)
