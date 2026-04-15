# --- Inputs ---
_test_case_data_json: str = globals().get('_test_case_data_json', '{}')
_func_id: str = globals().get('_func_id', '_unnamed')
_indented_implementation: str = globals().get('_indented_implementation', '    pass')
_expected_result: str = globals().get('_expected_result', 'pass')
# ---

import pandas as pd
import math
import sys
import json
from io import StringIO
from dicompare.validation import ValidationError, ValidationWarning, BaseValidationModel, validator

# Capture stdout
captured_output = StringIO()
sys.stdout = captured_output

# _test_case_data_json, _func_id, _indented_implementation, _expected_result
# are set as pyodide globals by the caller

# Create test data from JSON passed as global
_raw_data = json.loads(_test_case_data_json)

# Try to create DataFrame with better error handling
try:
    value = pd.DataFrame(_raw_data)
    # Compute smart Count if not already provided
    # Count = actual slice count (handles mosaic/enhanced DICOM)
    if "Count" not in value.columns:
        if "SliceLocation" in value.columns:
            value["Count"] = value["SliceLocation"].nunique()
        else:
            value["Count"] = len(value)
except ValueError as e:
    if "All arrays must be of the same length" in str(e):
        field_lengths = {k: len(v) for k, v in _raw_data.items()}
        error_msg = f"Test data error: All fields must have the same number of values. Found: {field_lengths}"
        raise ValueError(error_msg)
    else:
        raise

# Initialize test results
test_passed = False
error_message = None

# Try to compile the function first to catch syntax errors
function_code = f'''def {_func_id}(cls, value):
{_indented_implementation}
'''

try:
    # First compile the function
    compiled_code = compile(function_code, '<string>', 'exec')

    # Create a namespace for execution
    exec_namespace = {
        'pd': pd,
        'math': math,
        'ValidationError': ValidationError,
        'ValidationWarning': ValidationWarning,
        'value': value
    }

    # Execute the function definition
    exec(compiled_code, exec_namespace)

    # Now try to call the function
    exec_namespace[_func_id](None, value)

    # If we reach here without exception, the function passed
    test_passed = True
    error_message = None
    warning_message = None

except SyntaxError as e:
    test_passed = False
    error_message = f"Syntax error in function: {str(e)}"
    warning_message = None
except ValidationError as e:
    test_passed = False
    error_message = str(e)
    warning_message = None
except ValidationWarning as e:
    test_passed = True  # Warning means it passed but with issues
    error_message = None
    warning_message = str(e)
except Exception as e:
    test_passed = False
    error_message = f"Unexpected error: {str(e)}"
    warning_message = None

# Get captured output
stdout_content = captured_output.getvalue()

# Restore stdout
sys.stdout = sys.__stdout__

# Return result as JSON
json.dumps({
    "passed": test_passed,
    "error": error_message,
    "warning": warning_message,
    "expected_result": _expected_result,
    "stdout": stdout_content
})
