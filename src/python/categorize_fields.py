# --- Inputs ---
field_definitions = globals().get('field_definitions', [])
test_data_rows = globals().get('test_data_rows', [])
# ---

import json
from dicompare.io import categorize_fields, get_unhandled_field_warnings

field_defs = field_definitions.to_py() if hasattr(field_definitions, 'to_py') else field_definitions
test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows

categorized = categorize_fields(field_defs)
warnings = get_unhandled_field_warnings(field_defs, test_rows)

json.dumps({
    'standardFields': len(categorized['standard']),
    'handledFields': len(categorized['handled']),
    'unhandledFields': len(categorized['unhandled']),
    'unhandledFieldWarnings': warnings
})
