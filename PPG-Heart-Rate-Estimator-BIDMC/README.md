# PPG Heart Rate Estimator — BIDMC-informed Dataset

Original architecture and model code by [RAj5517/ppg_heart_rate_estimator](https://github.com/RAj5517/ppg_heart_rate_estimator) (MIT License, Sayanendu Pramanik), upstream commit 649e3f2e92ab82738428cfd7d06d1187669442ab.

This adaptation **keeps model.py, train.py, convert_tflite.py, visualize.py and upload_to_hf.py unmodified**. It replaces only data/prepare_data.py and adds data methodology and QA tests. This generator no longer uses an unconstrained purely sinusoidal PPG source. Instead it extracts pulse-shape templates from the PhysioNet BIDMC dataset and creates reproducible, patient-disjoint synthetic PPG windows.

## Original CNN–LSTM architecture (unchanged)

Input PPG (1000 time steps x 1 channel; 8 s @ 125 Hz) -> Conv1D(16,k7)+BN+MaxPool2 -> Conv1D(32,k5)+BN+MaxPool2 -> Conv1D(64,k3)+BN+MaxPool2 -> LSTM(32,return_sequences=True)+Dropout(0.2) -> LSTM(16) -> Dense(32)+Dropout(0.2) -> Dense(1), BPM. The training script expands input arrays from [N,1000] to [N,1000,1].

## BIDMC-informed dataset

Source: [BIDMC PPG and Respiration Dataset v1.0.0](https://physionet.org/content/bidmc/1.0.0/), DOI [10.13026/C2208R](https://doi.org/10.13026/C2208R), 53 ICU recordings of 8 minutes, 125-Hz PLETH, 1-Hz ECG-derived HR and PPG-derived PULSE annotations. Fixed record metadata supplies an MIMIC II matched subject ID to group windows by patient.

Pipeline steps: original CSV download -> inspect and synchronize PLETH + ECG HR + pulse labels -> exclude invalid/noisy source windows -> 0.45–8 Hz bandpass filtering -> robust beat-template extraction -> patient-disjoint train/validation/test split -> generate morphology-based PPG pulse trains with respiratory variation -> inject controlled clean/noisy disturbance -> per-window min/max normalization -> export NumPy arrays and QA metadata.

| Split | Clean | Noisy | Total |
|---|---:|---:|---:|
| Train | 5,760 | 1,440 | 7,200 |
| Val | 1,040 | 260 | 1,300 |
| Test | 1,200 | 300 | 1,500 |
| **Total** | **8,000** | **2,000** | **10,000** |

All samples are float32, with 1000 steps per signal at 125 Hz; target y is BPM in the 45–150 range. Noisy samples have motion-burst, baseline-wander, impulse or contact-transient disturbance, injected SNR from 2 to 14 dB; clean samples have low injected noise (26–40 dB). These are selected engineering ranges, not measured BIDMC SNR values.

**Critical distinction:** the 10,000 samples are *semi-synthetic generated windows*, not 10,000 independent clinical patient recordings. Train/val/test sample counts are fixed but source patient allocation is performed before synthesis. A separate genuinely observed, held-out BIDMC PPG test set is exported to estimate the synthetic-real generalization gap. Clinical accuracy claims cannot be made from synthetic-only test scores.

## Quickstart (Linux / Kaggle)

Run from within this directory:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python data/prepare_data.py --download --source bidmc_raw --output data
python tests/test_dataset.py
python train.py
python convert_tflite.py
python visualize.py
```

The pipeline downloads all 53 BIDMC Signals.csv, Numerics.csv, Fix.txt source files into bidmc_raw/ (excluded from Git). Pre-downloaded files can be used without --download. Testing uses fabricated CSV fixtures, not BIDMC real signals.

Expected files:
- data/X_train.npy (7200,1000), data/X_val.npy (1300,1000), data/X_test.npy (1500,1000)
- data/y_train.npy (7200,), data/y_val.npy (1300,), data/y_test.npy (1500,)
- data/metadata_train.csv, metadata_val.csv, metadata_test.csv
- data/X_bidmc_real_test.npy and y_bidmc_real_test.npy (independent real held-out windows)
- data/dataset_report.json and data/extraction_audit.csv
- data/waveform_examples.png, hr_distribution.png, noise_snr_distribution.png

The author's published 0.54 BPM synthetic MAE and performance results must **not** be transferred to this new dataset without retraining and evaluation. The hardcoded upload_to_hf.py targets the original author's Hugging Face repo: do NOT run it to publish a model without changing account ownership and receiving permission. All original script logic is preserved for auditability.

See also README_UPSTREAM.md, data/METHODS_VI.md and upstream_reference/prepare_data_original.py.

## Attribution

- Original source and MIT license: Sayanendu Pramanik, RAJ5517, [upstream repository](https://github.com/RAj5517/ppg_heart_rate_estimator).
- Physiological data: Pimentel et al., BIDMC PPG and Respiration Dataset v1.0.0, PhysioNet, DOI 10.13026/C2208R, Open Data Commons Attribution License 1.0.
