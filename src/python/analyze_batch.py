# --- Inputs ---
dicom_file_names: list = globals().get('dicom_file_names', [])
dicom_file_contents: list = globals().get('dicom_file_contents', [])
progress_callback = globals().get('progress_callback', lambda p: None)
batch_index: int = globals().get('batch_index', 0)
total_batches: int = globals().get('total_batches', 1)
# ---

import json
from dicompare.interface import analyze_dicom_files_for_ui

names = list(dicom_file_names)
batch_num = batch_index + 1
num_batches = total_batches
print(f"[Worker] Processing batch {batch_num}/{num_batches}: {len(names)} files...")

dicom_bytes = {}
for i, name in enumerate(names):
    content = dicom_file_contents[i]
    if hasattr(content, 'getBuffer'):
        buf = content.getBuffer()
        dicom_bytes[name] = bytes(buf.data)
        buf.release()
    elif hasattr(content, 'to_py'):
        dicom_bytes[name] = bytes(content.to_py())
    else:
        dicom_bytes[name] = bytes(content)

print(f"[Worker] Converted {len(dicom_bytes)} files, analyzing...")
acquisitions = await analyze_dicom_files_for_ui(dicom_bytes, progress_callback)

# Explicit cleanup to free memory before next batch
del dicom_bytes
del dicom_file_names
del dicom_file_contents

json.dumps(acquisitions, default=str)
