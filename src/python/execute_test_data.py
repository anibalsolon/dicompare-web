# --- Inputs ---
_user_code_indented: str = globals().get('_user_code_indented', '    pass')
# ---

import pandas as pd
import numpy as np
import json

# _user_code_indented is set as a pyodide global by the caller (user code indented for function body)
_exec_ns = {'pd': pd, 'np': np}
exec(f"def generate_test_data():\n{_user_code_indented}", _exec_ns)
generate_test_data = _exec_ns['generate_test_data']

output = None
try:
    result = generate_test_data()
    if not isinstance(result, dict):
        raise ValueError("Code must return a dictionary")

    # Convert numpy arrays and other non-serializable types to lists
    cleaned_result = {}
    for key, value in result.items():
        if hasattr(value, 'tolist'):  # numpy array
            cleaned_result[key] = value.tolist()
        elif isinstance(value, list):
            # Handle lists that might contain numpy types
            cleaned_list = []
            for item in value:
                if hasattr(item, 'tolist'):
                    cleaned_list.append(item.tolist())
                elif hasattr(item, 'item'):  # numpy scalar
                    cleaned_list.append(item.item())
                else:
                    cleaned_list.append(item)
            cleaned_result[key] = cleaned_list
        elif hasattr(value, 'item'):  # numpy scalar
            cleaned_result[key] = [value.item()]
        else:
            cleaned_result[key] = [value] if not isinstance(value, list) else value

    # Validate all arrays have same length
    if cleaned_result:
        lengths = [len(v) for v in cleaned_result.values()]
        if len(set(lengths)) > 1:
            field_lengths = {k: len(v) for k, v in cleaned_result.items()}
            raise ValueError(f"All fields must have the same number of values. Found: {field_lengths}")

    output = json.dumps({"success": True, "data": cleaned_result})
except Exception as e:
    output = json.dumps({"success": False, "error": str(e)})

# Return the JSON output
output
