import numpy as np
import os
from scipy.signal import butter, filtfilt
from sklearn.model_selection import train_test_split

os.makedirs('data', exist_ok=True)

np.random.seed(42)

FS       = 125       # Hz
WIN_SEC  = 8
WIN_LEN  = FS * WIN_SEC   # 1000 samples
N_CLEAN  = 8000           # clean samples
N_NOISY  = 2000           # motion artifact samples

# ─────────────────────────────────────────
# 1. Realistic PPG waveform generator
# ─────────────────────────────────────────
def generate_ppg(hr_bpm, duration_sec=8, fs=125,
                 noise_level=0.05, motion=False):
    t      = np.linspace(0, duration_sec, int(fs * duration_sec))
    hr_hz  = hr_bpm / 60.0

    # Main cardiac pulse
    ppg    = np.sin(2 * np.pi * hr_hz * t)
    # Dicrotic notch (second harmonic)
    ppg   += 0.35 * np.sin(4 * np.pi * hr_hz * t + 0.6)
    # Third harmonic (realistic peak shape)
    ppg   += 0.1  * np.sin(6 * np.pi * hr_hz * t + 0.3)
    # Respiratory modulation (~0.25 Hz)
    resp_hz = np.random.uniform(0.2, 0.35)
    ppg   += 0.15 * np.sin(2 * np.pi * resp_hz * t)
    # Gaussian noise
    ppg   += np.random.normal(0, noise_level, len(t))

    if motion:
        # Motion artifact: low freq burst
        art_hz  = np.random.uniform(0.5, 2.5)
        art_amp  = np.random.uniform(0.2, 0.5)
        ppg += art_amp * np.sin(2 * np.pi * art_hz * t)

    # Normalize to [0, 1]
    ppg = (ppg - ppg.min()) / (ppg.max() - ppg.min() + 1e-8)
    return ppg.astype(np.float32)

# ─────────────────────────────────────────
# 2. Generate dataset
# ─────────────────────────────────────────
print("Generating synthetic PPG dataset...")

X_list, y_list = [], []

# Clean samples — HR 45 to 150 BPM
hr_clean = np.random.uniform(45, 150, N_CLEAN)
for hr in hr_clean:
    ppg = generate_ppg(hr, noise_level=np.random.uniform(0.02, 0.08))
    X_list.append(ppg)
    y_list.append(hr)

# Noisy samples — HR 50 to 130 BPM with motion
hr_noisy = np.random.uniform(50, 130, N_NOISY)
for hr in hr_noisy:
    ppg = generate_ppg(hr, noise_level=np.random.uniform(0.05, 0.15),
                       motion=True)
    X_list.append(ppg)
    y_list.append(hr)

X = np.array(X_list, dtype=np.float32)   # [N, 1000]
y = np.array(y_list, dtype=np.float32)   # [N]

# Shuffle
idx = np.random.permutation(len(X))
X, y = X[idx], y[idx]

print(f"Total samples  : {len(X)}")
print(f"X shape        : {X.shape}")
print(f"HR range       : {y.min():.1f} – {y.max():.1f} BPM")
print(f"HR mean        : {y.mean():.1f} ± {y.std():.1f} BPM")

# ─────────────────────────────────────────
# 3. Train / val / test split  72/13/15
# ─────────────────────────────────────────
X_temp, X_test, y_temp, y_test = train_test_split(
    X, y, test_size=0.15, random_state=42
)
X_train, X_val, y_train, y_val = train_test_split(
    X_temp, y_temp, test_size=0.15, random_state=42
)

print(f"\n── Splits ───────────────────────────────")
print(f"Train : {X_train.shape}   HR: {y_train.mean():.1f} ± {y_train.std():.1f}")
print(f"Val   : {X_val.shape}    HR: {y_val.mean():.1f} ± {y_val.std():.1f}")
print(f"Test  : {X_test.shape}   HR: {y_test.mean():.1f} ± {y_test.std():.1f}")

# ─────────────────────────────────────────
# 4. Save
# ─────────────────────────────────────────
np.save('data/X_train.npy', X_train)
np.save('data/X_val.npy',   X_val)
np.save('data/X_test.npy',  X_test)
np.save('data/y_train.npy', y_train)
np.save('data/y_val.npy',   y_val)
np.save('data/y_test.npy',  y_test)

print(f"\n✅ Saved to data/")
print(f"   X_train {X_train.shape}  X_val {X_val.shape}  X_test {X_test.shape}")