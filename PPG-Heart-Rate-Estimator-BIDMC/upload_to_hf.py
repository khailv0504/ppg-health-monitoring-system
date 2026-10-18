from huggingface_hub import HfApi, create_repo

REPO_ID = "raj5517/ppg-heart-rate-estimator"
api = HfApi()

# ─────────────────────────────────────────
# 1. Create repo
# ─────────────────────────────────────────
create_repo(REPO_ID, repo_type="model", exist_ok=True)
print(f"✅ Repo ready: https://huggingface.co/{REPO_ID}")

# ─────────────────────────────────────────
# 2. Upload files
# ─────────────────────────────────────────
uploads = [
    ("models/ppg_hr_fp16.tflite",          "ppg_hr_fp16.tflite"),
    ("models/ppg_hr_dynamic.tflite",        "ppg_hr_dynamic.tflite"),
    ("outputs/scatter_pred_vs_true.png",    "scatter_pred_vs_true.png"),
    ("outputs/error_histogram.png",         "error_histogram.png"),
    ("outputs/mae_by_hr_range.png",         "mae_by_hr_range.png"),
    ("outputs/training_curves.png",         "training_curves.png"),
    ("model.py",                            "model.py"),
    ("requirements.txt",                    "requirements.txt"),
]

for local_path, repo_path in uploads:
    api.upload_file(
        path_or_fileobj=local_path,
        path_in_repo=repo_path,
        repo_id=REPO_ID,
        repo_type="model",
    )
    print(f"  ✅ Uploaded {repo_path}")

# ─────────────────────────────────────────
# 3. Model card
# ─────────────────────────────────────────
model_card = """---
language: en
license: mit
tags:
  - tensorflow
  - tflite
  - time-series
  - heart-rate
  - ppg
  - biosignals
  - edge-deployment
  - regression
metrics:
  - mae
---

# PPG Heart Rate Estimator — CNN/LSTM with TFLite Deployment

Lightweight CNN/LSTM for heart rate estimation from raw PPG signals.
Deployed as TensorFlow Lite for mobile and embedded targets.

## Results

| Model | Size | MAE | Within ±5 BPM |
|-------|------|-----|----------------|
| Baseline FP32 Keras | 99.6 KB | **0.54 BPM** | **100%** |
| FP16 TFLite | 82.5 KB | ~0.55 BPM | ~100% |
| Dynamic Quant TFLite | 63.5 KB | ~0.57 BPM | ~100% |

- Median error: 0.34 BPM
- P95 error: 1.86 BPM
- Max error: 4.36 BPM

## Architecture
```
Input (1000, 1) — 8 sec @ 125Hz
→ Conv1D(16,k=7) → BN → MaxPool(2)
→ Conv1D(32,k=5) → BN → MaxPool(2)
→ Conv1D(64,k=3) → BN → MaxPool(2)
→ LSTM(32, return_sequences=True) → Dropout
→ LSTM(16)
→ Dense(32) → Dropout
→ Dense(1)  — BPM regression
```

Total params: 25,505 (~100KB FP32)

## Predicted vs True
![Scatter](scatter_pred_vs_true.png)

## Error Distribution
![Histogram](error_histogram.png)

## MAE by HR Range
![MAE by Range](mae_by_hr_range.png)

## Training Curves
![Training](training_curves.png)

## Usage
```python
import tensorflow as tf
import numpy as np

interpreter = tf.lite.Interpreter(
    model_path="ppg_hr_dynamic.tflite",
    experimental_delegates=[tf.lite.load_delegate('tensorflowlite_flex')]
)
interpreter.allocate_tensors()
inp = interpreter.get_input_details()
out = interpreter.get_output_details()

# sample: (1, 1000, 1) float32 — normalized PPG window
sample = np.random.randn(1, 1000, 1).astype(np.float32)
interpreter.set_tensor(inp[0]['index'], sample)
interpreter.invoke()
hr_bpm = interpreter.get_tensor(out[0]['index'])[0][0]
print(f"Estimated HR: {hr_bpm:.1f} BPM")
```

## Notes

LSTM layers require the Flex delegate for TFLite inference.
On Android: add `tensorflow-lite-select-tf-ops` dependency.

## Links

- GitHub: https://github.com/RAj5517/ppg_heart_rate_estimator
"""

api.upload_file(
    path_or_fileobj=model_card.encode(),
    path_in_repo="README.md",
    repo_id=REPO_ID,
    repo_type="model",
)
print("  ✅ Uploaded README.md (model card)")
print(f"\n🎉 Done! https://huggingface.co/{REPO_ID}")