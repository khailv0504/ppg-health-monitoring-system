import tensorflow as tf
from tensorflow.keras import layers, Model

FS       = 125
WIN_LEN  = 1000   # 8 seconds @ 125 Hz


def build_ppg_model(input_length=WIN_LEN):
    """
    Lightweight CNN/LSTM for PPG heart rate regression.

    Architecture:
      - Conv1D blocks  → extract local pulse morphology
                         (peak shape, dicrotic notch)
      - LSTM layers    → capture temporal periodicity
                         (rhythm across multiple beats)
      - Dense head     → regress single BPM value

    Design for TFLite edge deployment:
      - No attention, no transformers
      - Aggressive MaxPooling before LSTM
        (reduces sequence 1000 → 125 before LSTM)
      - Small LSTM hidden dims (32, 16)
      - Target: <50ms inference on TFLite
    """
    inputs = tf.keras.Input(shape=(input_length, 1), name='ppg_input')

    # ── CNN Block 1 ───────────────────────────
    x = layers.Conv1D(16, kernel_size=7, padding='same',
                      activation='relu', name='conv1')(inputs)
    x = layers.BatchNormalization(name='bn1')(x)
    x = layers.MaxPooling1D(pool_size=2, name='pool1')(x)   # 1000 → 500

    # ── CNN Block 2 ───────────────────────────
    x = layers.Conv1D(32, kernel_size=5, padding='same',
                      activation='relu', name='conv2')(x)
    x = layers.BatchNormalization(name='bn2')(x)
    x = layers.MaxPooling1D(pool_size=2, name='pool2')(x)   # 500 → 250

    # ── CNN Block 3 ───────────────────────────
    x = layers.Conv1D(64, kernel_size=3, padding='same',
                      activation='relu', name='conv3')(x)
    x = layers.BatchNormalization(name='bn3')(x)
    x = layers.MaxPooling1D(pool_size=2, name='pool3')(x)   # 250 → 125

    # ── LSTM Temporal Modeling ─────────────────
    x = layers.LSTM(32, return_sequences=True, name='lstm1')(x)
    x = layers.Dropout(0.2, name='drop_lstm')(x)
    x = layers.LSTM(16, return_sequences=False, name='lstm2')(x)

    # ── Regression Head ────────────────────────
    x = layers.Dense(32, activation='relu', name='dense1')(x)
    x = layers.Dropout(0.2, name='drop_dense')(x)
    outputs = layers.Dense(1, name='hr_output')(x)   # single BPM value

    model = Model(inputs, outputs, name='PPG_HR_Estimator')
    return model


if __name__ == '__main__':
    model = build_ppg_model()
    model.summary()

    total    = model.count_params()
    size_kb  = total * 4 / 1024

    print(f"\n── Model Info ──────────────────────────")
    print(f"Total parameters  : {total:,}")
    print(f"FP32 size estimate: {size_kb:.1f} KB")
    print(f"Input shape       : ({WIN_LEN}, 1)  →  8 sec PPG @ 125Hz")
    print(f"Output            : single BPM value (regression)")
    print(f"\n✅ Model built successfully.")