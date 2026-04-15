# --- Inputs ---
dicom_file_names: list = globals().get('dicom_file_names', [])
dicom_file_contents: list = globals().get('dicom_file_contents', [])
progress_callback = globals().get('progress_callback', lambda p: None)
# ---

import json
from dicompare.interface import analyze_dicom_files_for_ui

names = list(dicom_file_names)
total_files = len(names)
print(f"[Worker] Processing {total_files} files...")

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
json.dumps(acquisitions, default=str)
