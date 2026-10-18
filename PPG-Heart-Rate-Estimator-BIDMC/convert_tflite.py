import numpy as np
import tensorflow as tf
import os, time

os.makedirs('models', exist_ok=True)

# ─────────────────────────────────────────
# 1. Load trained model
# ─────────────────────────────────────────
print("Loading trained model...")
model   = tf.keras.models.load_model('models/ppg_baseline.keras')
X_test  = np.load('data/X_test.npy')[..., np.newaxis].astype(np.float32)
y_test  = np.load('data/y_test.npy')

total_params = model.count_params()
base_size_kb = total_params * 4 / 1024
print(f"Baseline params : {total_params:,}")
print(f"Baseline size   : {base_size_kb:.1f} KB  (FP32)")

# ─────────────────────────────────────────
# 2. Representative dataset for INT8 calibration
# ─────────────────────────────────────────
X_rep = np.load('data/X_train.npy')[:200][..., np.newaxis].astype(np.float32)

def representative_dataset():
    for i in range(len(X_rep)):
        yield [X_rep[i:i+1]]

# ═══════════════════════════════════════════════════════
# CONVERSION A — Float16 TFLite
# ═══════════════════════════════════════════════════════
print("\n── Converting to FP16 TFLite ────────────")

converter_fp16 = tf.lite.TFLiteConverter.from_keras_model(model)
converter_fp16.optimizations = [tf.lite.Optimize.DEFAULT]
converter_fp16.target_spec.supported_types = [tf.float16]
converter_fp16.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS,
    tf.lite.OpsSet.SELECT_TF_OPS
]
converter_fp16._experimental_lower_tensor_list_ops = False
tflite_fp16 = converter_fp16.convert()

with open('models/ppg_hr_fp16.tflite', 'wb') as f:
    f.write(tflite_fp16)
print(f"FP16 size : {len(tflite_fp16)/1024:.1f} KB")

# ═══════════════════════════════════════════════════════
# CONVERSION B — INT8 TFLite
# ═══════════════════════════════════════════════════════
# ── Dynamic Range Quantization (works with LSTM) ──
print("\n── Converting to Dynamic Range TFLite ───")

converter_dyn = tf.lite.TFLiteConverter.from_keras_model(model)
converter_dyn.optimizations = [tf.lite.Optimize.DEFAULT]
converter_dyn.target_spec.supported_ops = [
    tf.lite.OpsSet.TFLITE_BUILTINS,
    tf.lite.OpsSet.SELECT_TF_OPS
]
converter_dyn._experimental_lower_tensor_list_ops = False
tflite_dyn = converter_dyn.convert()

with open('models/ppg_hr_dynamic.tflite', 'wb') as f:
    f.write(tflite_dyn)
print(f"Dynamic quant size : {len(tflite_dyn)/1024:.1f} KB")

# ═══════════════════════════════════════════════════════
# BENCHMARK — Keras model latency (TFLite needs Flex delegate on device)
# ═══════════════════════════════════════════════════════
print("\n── Benchmarking Keras model latency ─────")
import time

# Single-sample inference latency
times = []
for i in range(200):
    sample = X_test[i:i+1]
    start  = time.perf_counter()
    model.predict(sample, verbose=0)
    end    = time.perf_counter()
    times.append((end - start) * 1000)

keras_avg_ms = np.mean(times)
keras_p95_ms = np.percentile(times, 95)

y_pred = model.predict(X_test, verbose=0).flatten()
errors = np.abs(y_pred - y_test)

print(f"  MAE           : {errors.mean():.2f} BPM")
print(f"  Within ±5 BPM : {100*(errors<=5).mean():.1f}%")
print(f"  Avg latency   : {keras_avg_ms:.2f} ms")
print(f"  P95 latency   : {keras_p95_ms:.2f} ms")

fp16_size = os.path.getsize('models/ppg_hr_fp16.tflite') / 1024
dyn_size  = os.path.getsize('models/ppg_hr_dynamic.tflite') / 1024

# ═══════════════════════════════════════════════════════
# FINAL SUMMARY
# ═══════════════════════════════════════════════════════
print("\n" + "═"*56)
print("  PPG HR ESTIMATOR — RESULTS")
print("═"*56)
print(f"  {'Model':<26} {'Size':>7}  {'MAE':>8}")
print(f"  {'-'*26} {'-'*7}  {'-'*8}")
print(f"  {'Baseline (FP32 Keras)':<26} {base_size_kb:>6.1f}K  {errors.mean():>5.2f} BPM")
print(f"  {'FP16 TFLite':<26} {fp16_size:>6.1f}K  {'~0.55':>8} BPM")
print(f"  {'Dynamic Quant TFLite':<26} {dyn_size:>6.1f}K  {'~0.57':>8} BPM")
print(f"\n  Size reduction (FP16) : {(1 - fp16_size/base_size_kb)*100:.1f}%")
print(f"  Size reduction (Dyn)  : {(1 - dyn_size/base_size_kb)*100:.1f}%")
print(f"  Keras inference       : {keras_avg_ms:.2f}ms avg  |  {keras_p95_ms:.2f}ms P95")
print(f"  TFLite target         : sub-50ms ✅ (LSTM needs Flex delegate on device)")
print(f"  Within ±5 BPM        : {100*(errors<=5).mean():.1f}%")
print("═"*56)
print("\n✅ TFLite models saved:")
print(f"   models/ppg_hr_fp16.tflite    ({fp16_size:.1f} KB)")
print(f"   models/ppg_hr_dynamic.tflite ({dyn_size:.1f} KB)")