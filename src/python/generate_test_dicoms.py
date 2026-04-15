# --- Inputs ---
test_data_rows = globals().get('test_data_rows', [])
schema_fields = globals().get('schema_fields', [])
acquisition_info = globals().get('acquisition_info', {})
# ---

from dicompare.io import generate_test_dicoms_from_schema

test_rows = test_data_rows.to_py() if hasattr(test_data_rows, 'to_py') else test_data_rows
field_info = schema_fields.to_py() if hasattr(schema_fields, 'to_py') else schema_fields
acq_info = acquisition_info.to_py() if hasattr(acquisition_info, 'to_py') else acquisition_info

zip_bytes = generate_test_dicoms_from_schema(
    test_data=test_rows,
    field_definitions=field_info,
    acquisition_info=acq_info
)

globals()['dicom_zip_bytes'] = list(zip_bytes)
