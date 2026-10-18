import numpy as np
import tensorflow as tf
from tensorflow.keras.callbacks import (
    EarlyStopping, ReduceLROnPlateau,
    ModelCheckpoint
)
import os, time
from model import build_ppg_model

# ─────────────────────────────────────────
# 0. GPU config
# ─────────────────────────────────────────
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    tf.config.experimental.set_memory_growth(gpus[0], True)
    print(f"✅ GPU found: {gpus[0].name}")
else:
    print("⚠️  No GPU found, running on CPU")

# ─────────────────────────────────────────
# 1. Load data
# ─────────────────────────────────────────
print("\nLoading data...")
X_train = np.load('data/X_train.npy')[..., np.newaxis]  # [N, 1000, 1]
X_val   = np.load('data/X_val.npy')[..., np.newaxis]
X_test  = np.load('data/X_test.npy')[..., np.newaxis]
y_train = np.load('data/y_train.npy')
y_val   = np.load('data/y_val.npy')
y_test  = np.load('data/y_test.npy')

print(f"X_train : {X_train.shape}  y_train : {y_train.shape}")
print(f"X_val   : {X_val.shape}    y_val   : {y_val.shape}")
print(f"X_test  : {X_test.shape}   y_test  : {y_test.shape}")
print(f"HR range: {y_train.min():.1f} – {y_train.max():.1f} BPM")

# ─────────────────────────────────────────
# 2. Build model
# ─────────────────────────────────────────
model = build_ppg_model(input_length=1000)

model.compile(
    optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3),
    loss='huber',       # robust to outliers vs MSE
    metrics=['mae']
)

model.summary()

# ─────────────────────────────────────────
# 3. Callbacks
# ─────────────────────────────────────────
os.makedirs('models', exist_ok=True)

callbacks = [
    EarlyStopping(
        monitor='val_mae',
        patience=15,
        restore_best_weights=True,
        verbose=1
    ),
    ReduceLROnPlateau(
        monitor='val_mae',
        factor=0.5,
        patience=7,
        min_lr=1e-6,
        verbose=1
    ),
    ModelCheckpoint(
        filepath='models/ppg_baseline.keras',
        monitor='val_mae',
        save_best_only=True,
        mode='min',
        verbose=1
    ),
]

# ─────────────────────────────────────────
# 4. Train
# ─────────────────────────────────────────
print("\n── Training ─────────────────────────────")
start = time.time()

history = model.fit(
    X_train, y_train,
    validation_data=(X_val, y_val),
    epochs=80,
    batch_size=64,
    callbacks=callbacks,
    verbose=1
)

elapsed = time.time() - start
print(f"\nTraining time: {elapsed/60:.1f} minutes")

# ─────────────────────────────────────────
# 5. Evaluate on test set
# ─────────────────────────────────────────
print("\n── Test Set Evaluation ──────────────────")
test_loss, test_mae = model.evaluate(X_test, y_test, verbose=0)
print(f"Test MAE  : {test_mae:.2f} BPM")
print(f"Test Loss : {test_loss:.4f}")

# Detailed error analysis
y_pred = model.predict(X_test, verbose=0).flatten()
errors = np.abs(y_pred - y_test)

print(f"\n── Error Distribution ───────────────────")
print(f"Mean Abs Error : {errors.mean():.2f} BPM")
print(f"Median Error   : {np.median(errors):.2f} BPM")
print(f"P90 Error      : {np.percentile(errors, 90):.2f} BPM")
print(f"P95 Error      : {np.percentile(errors, 95):.2f} BPM")
print(f"Max Error      : {errors.max():.2f} BPM")
print(f"Within ±5 BPM  : {100*(errors <= 5).mean():.1f}%")
print(f"Within ±10 BPM : {100*(errors <= 10).mean():.1f}%")

# HR range breakdown
print(f"\n── MAE by HR Range ──────────────────────")
ranges = [(45,75,'Low (45-75)'), (75,100,'Normal (75-100)'),
          (100,130,'Elevated (100-130)'), (130,150,'High (130-150)')]
for lo, hi, label in ranges:
    mask = (y_test >= lo) & (y_test < hi)
    if mask.sum() > 0:
        mae_r = errors[mask].mean()
        print(f"  {label:<22} MAE: {mae_r:.2f} BPM  (n={mask.sum()})")

# ─────────────────────────────────────────
# 6. Save
# ─────────────────────────────────────────
model.save('models/ppg_baseline.keras')
np.save('models/train_history.npy', history.history)
np.save('models/y_pred_test.npy',   y_pred)
np.save('models/y_test.npy',        y_test)

print(f"\n✅ Model saved  →  models/ppg_baseline.keras")
print(f"✅ History saved →  models/train_history.npy")