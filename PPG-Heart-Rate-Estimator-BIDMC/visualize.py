import numpy as np
import matplotlib.pyplot as plt
import tensorflow as tf
import os

os.makedirs('outputs', exist_ok=True)

# ─────────────────────────────────────────
# 1. Load data
# ─────────────────────────────────────────
y_pred   = np.load('models/y_pred_test.npy')
y_test   = np.load('models/y_test.npy')
history  = np.load('models/train_history.npy', allow_pickle=True).item()
errors   = np.abs(y_pred - y_test)

# ═══════════════════════════════════════════════════════
# PLOT 1 — Predicted vs True HR (scatter)
# ═══════════════════════════════════════════════════════
print("Generating scatter plot...")

fig, ax = plt.subplots(figsize=(7, 7))

sc = ax.scatter(y_test, y_pred, alpha=0.3, s=8,
                c=errors, cmap='RdYlGn_r', vmin=0, vmax=5)
plt.colorbar(sc, ax=ax, label='Absolute Error (BPM)')

# Perfect prediction line
mn, mx = y_test.min(), y_test.max()
ax.plot([mn, mx], [mn, mx], 'k--', linewidth=1.5, label='Perfect prediction')
ax.plot([mn, mx], [mn+5, mx+5], 'r:', linewidth=1, alpha=0.5, label='±5 BPM bound')
ax.plot([mn, mx], [mn-5, mx-5], 'r:', linewidth=1, alpha=0.5)

ax.set_xlabel('True HR (BPM)', fontsize=12)
ax.set_ylabel('Predicted HR (BPM)', fontsize=12)
ax.set_title(
    f'PPG Heart Rate Estimator — Predicted vs True\n'
    f'MAE: {errors.mean():.2f} BPM  |  Within ±5 BPM: {100*(errors<=5).mean():.1f}%',
    fontsize=12, fontweight='bold'
)
ax.legend(fontsize=10)
ax.set_xlim([mn-5, mx+5])
ax.set_ylim([mn-5, mx+5])
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('outputs/scatter_pred_vs_true.png', dpi=150, bbox_inches='tight')
plt.close()
print("  ✅ outputs/scatter_pred_vs_true.png")

# ═══════════════════════════════════════════════════════
# PLOT 2 — Error Histogram
# ═══════════════════════════════════════════════════════
print("Generating error histogram...")

fig, ax = plt.subplots(figsize=(8, 5))

ax.hist(errors, bins=50, color='#1976D2', edgecolor='white', alpha=0.85)
ax.axvline(errors.mean(),   color='red',    linestyle='--', linewidth=2,
           label=f'Mean: {errors.mean():.2f} BPM')
ax.axvline(np.median(errors), color='orange', linestyle='--', linewidth=2,
           label=f'Median: {np.median(errors):.2f} BPM')
ax.axvline(5, color='green', linestyle=':', linewidth=2,
           label='±5 BPM clinical threshold')

ax.set_xlabel('Absolute Error (BPM)', fontsize=12)
ax.set_ylabel('Count', fontsize=12)
ax.set_title(
    f'Prediction Error Distribution\n'
    f'P90: {np.percentile(errors,90):.2f} BPM  |  P95: {np.percentile(errors,95):.2f} BPM  |  Max: {errors.max():.2f} BPM',
    fontsize=12, fontweight='bold'
)
ax.legend(fontsize=10)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('outputs/error_histogram.png', dpi=150, bbox_inches='tight')
plt.close()
print("  ✅ outputs/error_histogram.png")

# ═══════════════════════════════════════════════════════
# PLOT 3 — Training Curves
# ═══════════════════════════════════════════════════════
print("Generating training curves...")

epochs = range(1, len(history['mae']) + 1)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(13, 5))
fig.suptitle('PPG HR Estimator — Training History', fontsize=14, fontweight='bold')

ax1.plot(epochs, history['mae'],     color='#2196F3', linewidth=2, label='Train MAE')
ax1.plot(epochs, history['val_mae'], color='#FF5722', linewidth=2,
         linestyle='--', label='Val MAE')
ax1.axhline(y=errors.mean(), color='green', linewidth=1.5, linestyle=':',
            label=f'Test MAE: {errors.mean():.2f} BPM')
ax1.set_title('MAE (BPM)', fontsize=12, fontweight='bold')
ax1.set_xlabel('Epoch')
ax1.set_ylabel('MAE (BPM)')
ax1.legend()
ax1.grid(True, alpha=0.3)

ax2.plot(epochs, history['loss'],     color='#2196F3', linewidth=2, label='Train Loss')
ax2.plot(epochs, history['val_loss'], color='#FF5722', linewidth=2,
         linestyle='--', label='Val Loss')
ax2.set_title('Huber Loss', fontsize=12, fontweight='bold')
ax2.set_xlabel('Epoch')
ax2.set_ylabel('Loss')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('outputs/training_curves.png', dpi=150, bbox_inches='tight')
plt.close()
print("  ✅ outputs/training_curves.png")

# ═══════════════════════════════════════════════════════
# PLOT 4 — MAE by HR Range (bar chart)
# ═══════════════════════════════════════════════════════
print("Generating MAE by HR range...")

ranges  = [(45,75,'Low\n45-75'), (75,100,'Normal\n75-100'),
           (100,130,'Elevated\n100-130'), (130,150,'High\n130-150')]
labels, maes, counts = [], [], []

for lo, hi, label in ranges:
    mask = (y_test >= lo) & (y_test < hi)
    if mask.sum() > 0:
        labels.append(label)
        maes.append(errors[mask].mean())
        counts.append(mask.sum())

fig, ax = plt.subplots(figsize=(8, 5))
bars = ax.bar(labels, maes, color=['#43A047','#1E88E5','#FB8C00','#E53935'],
              edgecolor='white', width=0.5)

for bar, mae, n in zip(bars, maes, counts):
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
            f'{mae:.2f} BPM\n(n={n})', ha='center', fontsize=10, fontweight='bold')

ax.axhline(y=5, color='red', linestyle='--', linewidth=1.5,
           label='±5 BPM clinical threshold', alpha=0.7)
ax.set_title('MAE by Heart Rate Range', fontsize=12, fontweight='bold')
ax.set_ylabel('Mean Absolute Error (BPM)')
ax.set_ylim(0, max(maes) * 1.5 + 0.5)
ax.legend()
ax.grid(axis='y', alpha=0.3)

plt.tight_layout()
plt.savefig('outputs/mae_by_hr_range.png', dpi=150, bbox_inches='tight')
plt.close()
print("  ✅ outputs/mae_by_hr_range.png")

print("\n── All plots saved to outputs/ ──────────")
print("  scatter_pred_vs_true.png")
print("  error_histogram.png")
print("  training_curves.png")
print("  mae_by_hr_range.png")