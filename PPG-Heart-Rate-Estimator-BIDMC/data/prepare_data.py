#!/usr/bin/env python3
"""BIDMC-informed semi-synthetic PPG dataset preparation.
Produces six .npy arrays directly compatible with the unmodified upstream train.py.
10,000 generated windows are NOT 10,000 independent clinical recordings.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import math
import re
import time
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path
import numpy as np
import pandas as pd
from scipy.signal import butter, find_peaks, savgol_filter, sosfiltfilt

FS = 125
N = 1000
WIN_SEC = 8
TEMPLATE_LEN = 128
RECORD_IDS = range(1, 54)
BASE_URL = "https://physionet.org/files/bidmc/1.0.0/bidmc_csv"
SPLIT_SPEC = {"train": (5760, 1440), "val": (1040, 260), "test": (1200, 300)}
SOS = butter(3, [0.45, 8.0], btype="bandpass", fs=FS, output="sos")


def fetch_if_missing(root: Path, record_id: int) -> None:
    root.mkdir(parents=True, exist_ok=True)
    for kind, ext in [("Signals", "csv"), ("Numerics", "csv"), ("Fix", "txt")]:
        name = f"bidmc_{record_id:02d}_{kind}.{ext}"
        target = root / name
        if target.is_file() and target.stat().st_size > 0:
            continue
        address = f"{BASE_URL}/{name}"
        print("Download:", address, flush=True)
        error = None
        for retry in range(3):
            try:
                request = urllib.request.Request(address, headers={"User-Agent": "BIDMC-PPG-research/1.0"})
                with urllib.request.urlopen(request, timeout=90) as response:
                    data = response.read()
                if not data:
                    raise IOError(f"Empty response for {address}")
                temp = target.with_suffix(target.suffix + ".part")
                temp.write_bytes(data)
                temp.replace(target)
                break
            except Exception as exc:
                error = exc
                if retry < 2:
                    time.sleep(retry + 1)
        else:
            raise RuntimeError(f"Failed downloading {address}: {error}")


def read_patient_id(path: Path) -> str:
    contents = path.read_text(encoding="utf-8", errors="replace")
    found = re.search(r"^MIMIC II matched wdb ID:\s*(\S+)\s*$", contents, flags=re.M | re.I)
    if not found:
        raise ValueError(f"Cannot parse the patient ID in {path}; patient grouping required")
    return found.group(1)


def assert_columns(frame: pd.DataFrame, path: Path, cols: list[str]) -> pd.DataFrame:
    frame.columns = [str(x).strip() for x in frame.columns]
    missing = set(cols).difference(frame.columns)
    if missing:
        raise ValueError(f"Missing {missing} in {path}; actual columns: {list(frame.columns)}")
    return frame


def clean_window(raw: np.ndarray) -> np.ndarray | None:
    """Interpolate up to 1% missing points and reject invalid/flat signal."""
    raw = np.asarray(raw, dtype=np.float64)
    good = np.isfinite(raw)
    if raw.size != N or good.mean() < 0.99:
        return None
    if not good.all():
        ix = np.arange(N)
        raw = np.interp(ix, ix[good], raw[good])
    if np.std(raw) < 1e-5:
        return None
    z = sosfiltfilt(SOS, raw)
    if np.std(z) < 1e-5 or not np.isfinite(z).all():
        return None
    return z


def extract_template(ppg: np.ndarray, hr: float) -> tuple[np.ndarray, float, float] | None:
    """Extract a median observed beat after beat-timing and label agreement checks."""
    period = 60 * FS / hr
    best = None
    for orientation in (+1, -1):
        x = ppg * orientation
        peaks, _ = find_peaks(x, distance=max(15, int(0.72 * period)),
                              prominence=0.40 * np.std(x))
        if len(peaks) < 5:
            continue
        ibis = np.diff(peaks).astype(float)
        valid = ibis[(ibis > 0.70 * period) & (ibis < 1.35 * period)]
        if len(valid) < 4:
            continue
        peak_hr = 60 * FS / np.median(valid)
        cv = float(np.std(valid) / np.mean(valid))
        if abs(peak_hr - hr) > 13 or cv > 0.24:
            continue
        beats = []
        for a, b in zip(peaks[:-1], peaks[1:]):
            if 0.70 * period <= b - a <= 1.35 * period:
                beat = x[a:b+1]
                beats.append(np.interp(np.linspace(0, 1, TEMPLATE_LEN),
                                       np.linspace(0, 1, len(beat)), beat))
        if len(beats) < 4:
            continue
        prototype = np.median(np.stack(beats), axis=0)
        prototype = savgol_filter(prototype, window_length=9, polyorder=2)
        boundary = 0.5 * (prototype[0] + prototype[-1])
        prototype[0] = prototype[-1] = boundary
        prototype -= np.mean(prototype)
        scale = np.std(prototype)
        if scale < 1e-6:
            continue
        prototype /= scale
        score = abs(peak_hr - hr) + 9 * cv
        if best is None or score < best[0]:
            best = (score, prototype.astype(np.float32), peak_hr, cv)
    return None if best is None else (best[1], float(best[2]), float(best[3]))


def collect_prototypes(root: Path, stride_sec: int) -> tuple[list[dict], list[dict]]:
    prototypes, record_audit = [], []
    for rec in RECORD_IDS:
        prefix = f"bidmc_{rec:02d}"
        signal_path = root / f"{prefix}_Signals.csv"
        numeric_path = root / f"{prefix}_Numerics.csv"
        fix_path = root / f"{prefix}_Fix.txt"
        for path in (signal_path, numeric_path, fix_path):
            if not path.exists():
                raise FileNotFoundError(f"{path} does not exist. Use --download or copy original files.")
        pid = read_patient_id(fix_path)
        s = assert_columns(pd.read_csv(signal_path), signal_path, ["Time [s]", "PLETH"])
        n = assert_columns(pd.read_csv(numeric_path), numeric_path, ["Time [s]", "HR", "PULSE", "RESP"])
        times = pd.to_numeric(s["Time [s]"], errors="coerce").to_numpy(float)
        pleth = pd.to_numeric(s["PLETH"], errors="coerce").to_numpy(float)
        sample_dt = np.median(np.diff(times[:min(len(times), 1000)]))
        if not math.isfinite(sample_dt) or abs(sample_dt - 1/FS) > 0.001:
            raise ValueError(f"{signal_path}: expected 125 Hz, measured dt={sample_dt}")
        numeric_t = pd.to_numeric(n["Time [s]"], errors="coerce").to_numpy(float)
        hr = pd.to_numeric(n["HR"], errors="coerce").to_numpy(float)
        pulse = pd.to_numeric(n["PULSE"], errors="coerce").to_numpy(float)
        resp = pd.to_numeric(n["RESP"], errors="coerce").to_numpy(float)
        discarded = Counter()
        accepted = 0
        for start in range(0, len(pleth)-N+1, stride_sec*FS):
            t0 = float(times[start])
            mask = (numeric_t >= t0) & (numeric_t < t0+WIN_SEC)
            hrs = hr[mask]
            hrs = hrs[np.isfinite(hrs)]
            pulses = pulse[mask]
            pulses = pulses[np.isfinite(pulses)]
            if len(hrs) < 6 or not (45 <= np.median(hrs) <= 150):
                discarded["invalid_hr"] += 1
                continue
            if np.percentile(hrs, 90) - np.percentile(hrs, 10) > 9:
                discarded["unstable_hr"] += 1
                continue
            if len(pulses) < 5 or abs(np.median(hrs)-np.median(pulses)) > 12:
                discarded["ecg_ppg_rate_disagreement"] += 1
                continue
            clean = clean_window(pleth[start:start+N])
            if clean is None:
                discarded["invalid_ppg"] += 1
                continue
            parsed = extract_template(clean, float(np.median(hrs)))
            if parsed is None:
                discarded["pulse_quality"] += 1
                continue
            template, peak_hr, ibi_cv = parsed
            rr = resp[mask]
            rr = rr[np.isfinite(rr)]
            rr_value = float(np.clip(np.median(rr), 8, 36)) if len(rr) >= 3 else 18.0
            observed_ppg = ((clean - clean.min()) /
                            max(1e-8, clean.max() - clean.min())).astype("float32")
            prototypes.append(dict(record=prefix, patient=pid, template=template,
                                   bpm=float(np.median(hrs)), rr=rr_value,
                                   peak_bpm=peak_hr, ibi_cv=ibi_cv, raw=observed_ppg,
                                   start_s=t0))
            accepted += 1
        record_audit.append(dict(record=prefix, patient=pid, accepted=accepted,
                                 rejected=dict(discarded)))
        print(f"{prefix}: {accepted} accepted windows; patient={pid}", flush=True)
    if not prototypes:
        raise RuntimeError("No valid PPG windows. Check CSV schema and screening thresholds.")
    return prototypes, record_audit


def group_patients(prototypes: list[dict], seed: int) -> dict[str, list[dict]]:
    grouped = defaultdict(list)
    for p in prototypes:
        grouped[p["patient"]].append(p)
    patients = np.array(sorted(grouped))
    if len(patients) < 9:
        raise RuntimeError(f"Only {len(patients)} usable patients, cannot split reliably.")
    rng = np.random.default_rng(seed)
    rng.shuffle(patients)
    n_train = int(round(len(patients) * 0.71))
    n_val = int(round(len(patients) * 0.13))
    assignment = {"train": patients[:n_train],
                  "val": patients[n_train:n_train+n_val],
                  "test": patients[n_train+n_val:]}
    return {k: [p for patient in ids for p in grouped[patient]]
            for k, ids in assignment.items()}


def synthesize_from_template(proto: dict, rng: np.random.Generator) -> tuple[np.ndarray, float]:
    bpm = float(np.clip(proto["bpm"] + rng.normal(0, 1.0), 45, 150))
    t = np.arange(N, dtype=float) / FS
    phase0 = rng.uniform(0, 1)
    phase = (bpm/60)*t + 0.012*np.sin(2*np.pi*0.17*t+rng.uniform(-np.pi, np.pi)) + phase0
    frac = np.mod(phase, 1)
    pulse = np.interp(frac, np.linspace(0, 1, TEMPLATE_LEN), proto["template"])
    resp_hz = proto["rr"]/60
    amplitude = 1 + rng.uniform(0.015, 0.065) * np.sin(2*np.pi*resp_hz*t+rng.uniform(0, 2*np.pi))
    clean = pulse * amplitude
    clean += rng.uniform(0.025, 0.09) * np.sin(2*np.pi*resp_hz*t+rng.uniform(0, 2*np.pi))
    return sosfiltfilt(SOS, clean), bpm


def noise_profile(kind: str, rng: np.random.Generator) -> tuple[np.ndarray, str]:
    t = np.arange(N, dtype=float)/FS
    e = rng.standard_normal(N)
    if kind == "clean":
        return sosfiltfilt(SOS, e), "low_gaussian"
    artifact = str(rng.choice(["motion_burst", "baseline_drift", "impulse", "contact_loss"]))
    e = 0.15 * e
    if artifact == "motion_burst":
        mask = np.exp(-0.5*((t-rng.uniform(2, 6))/rng.uniform(0.3,1.0))**2)
        e += mask * np.sin(2*np.pi*rng.uniform(0.7,2.7)*t+rng.uniform(0,6.28))
    elif artifact == "baseline_drift":
        e += 1.6*np.sin(2*np.pi*rng.uniform(0.33,0.9)*t+rng.uniform(0,6.28))
    elif artifact == "impulse":
        for _ in range(int(rng.integers(3, 9))):
            pos = int(rng.integers(10, N-10))
            e[pos:pos+int(rng.integers(2,10))] += rng.choice([-1,1])*rng.uniform(1.5,3.0)
    else:
        start = int(rng.integers(150, 750))
        width = int(rng.integers(50, 180))
        e[start:start+width] += rng.choice([-1,1])*2.0
    return sosfiltfilt(SOS, e), artifact


def make_sample(proto: dict, kind: str, rng: np.random.Generator) -> tuple[np.ndarray,float,float,str]:
    clean, bpm = synthesize_from_template(proto, rng)
    interference, artifact = noise_profile(kind, rng)
    snr_target = rng.uniform(26, 40) if kind == "clean" else rng.uniform(2,14)
    power_c = np.mean((clean-clean.mean())**2)
    power_n = np.mean((interference-interference.mean())**2)
    if power_c < 1e-10 or power_n < 1e-10:
        raise RuntimeError("Degenerate template or noise vector")
    corrupted = clean + np.sqrt(power_c/(power_n*10**(snr_target/10)))*interference
    lo, hi = float(corrupted.min()), float(corrupted.max())
    if hi-lo < 1e-8:
        raise RuntimeError("Synthetic waveform unexpectedly flat")
    return ((corrupted-lo)/(hi-lo)).astype("float32"), bpm, float(snr_target), artifact


def save_real_holdout(data: list[dict], folder: Path) -> None:
    X = np.stack([p["raw"] for p in data]).astype(np.float32)
    y = np.array([p["bpm"] for p in data], dtype=np.float32)
    np.save(folder/"X_bidmc_real_test.npy", X)
    np.save(folder/"y_bidmc_real_test.npy", y)
    fields = ["record", "patient", "start_s", "bpm", "peak_bpm", "ibi_cv"]
    with (folder/"bidmc_real_test_metadata.csv").open("w",newline="",encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows([{k:p[k] for k in fields} for p in data])


def draw_split(name: str, pool: list[dict], folder: Path, rng: np.random.Generator) -> list[dict]:
    n_clean, n_noisy = SPLIT_SPEC[name]
    labels = np.array(["clean"]*n_clean + ["noisy"]*n_noisy)
    rng.shuffle(labels)
    X = np.empty((len(labels),N),dtype="float32")
    y = np.empty(len(labels),dtype="float32")
    metadata = []
    for i, kind in enumerate(labels):
        proto = pool[int(rng.integers(len(pool)))]
        wave,bpm,snr,artifact = make_sample(proto,str(kind),rng)
        X[i],y[i] = wave,bpm
        metadata.append(dict(index=i,split=name,category=str(kind),
                             source_record=proto["record"],source_patient=proto["patient"],
                             source_start_s=proto["start_s"],source_ecg_hr=proto["bpm"],
                             label_bpm=bpm,rr_bpm=proto["rr"],snr_db=snr,artifact=artifact))
    assert np.isfinite(X).all() and np.isfinite(y).all()
    assert X.min() >= -1e-5 and X.max() <= 1.00001
    assert (y>=45).all() and (y<=150).all()
    np.save(folder/f"X_{name}.npy",X)
    np.save(folder/f"y_{name}.npy",y)
    with (folder/f"metadata_{name}.csv").open("w",newline="",encoding="utf-8") as f:
        writer=csv.DictWriter(f,fieldnames=list(metadata[0]))
        writer.writeheader()
        writer.writerows(metadata)
    print(f"{name:5s}: X={X.shape}, y={y.shape}, clean={n_clean}, noisy={n_noisy}")
    return metadata


def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1<<20),b""):
            h.update(chunk)
    return h.hexdigest()


def figures(folder: Path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    train = np.load(folder/"X_train.npy",mmap_mode="r")
    metadata = pd.concat([pd.read_csv(folder/f"metadata_{s}.csv") for s in SPLIT_SPEC],ignore_index=True)
    fig,axes=plt.subplots(2,1,figsize=(10,6),sharex=True)
    t=np.arange(N)/FS
    for ax,kind in zip(axes,["clean","noisy"]):
        ix=int(metadata[(metadata["split"]=="train")&(metadata["category"]==kind)].iloc[0]["index"])
        ax.plot(t,train[ix],linewidth=1)
        ax.set_ylabel("Normalized PPG")
        ax.set_title(f"{kind.capitalize()} synthetic waveform")
    axes[-1].set_xlabel("Time (s)")
    fig.tight_layout()
    fig.savefig(folder/"waveform_examples.png",bbox_inches="tight")
    plt.close(fig)
    fig,ax=plt.subplots(figsize=(9,4.5))
    for split in SPLIT_SPEC:
        ys=np.load(folder/f"y_{split}.npy")
        ax.hist(ys,bins=np.arange(45,154,5),alpha=0.55,density=True,label=split)
    ax.set_xlabel("Synthetic HR label (BPM)")
    ax.set_ylabel("Density")
    ax.legend()
    fig.tight_layout()
    fig.savefig(folder/"hr_distribution.png",bbox_inches="tight")
    plt.close(fig)
    fig,ax=plt.subplots(figsize=(8,4))
    for kind in ["clean","noisy"]:
        vals=metadata[metadata["category"]==kind]["snr_db"].to_numpy()
        ax.hist(vals,bins=np.arange(0,46,2),alpha=0.6,label=kind)
    ax.set_xlabel("Injected SNR (dB)")
    ax.set_ylabel("Count")
    ax.legend()
    fig.tight_layout()
    fig.savefig(folder/"noise_snr_distribution.png",bbox_inches="tight")
    plt.close(fig)


def run(args: argparse.Namespace) -> None:
    data_dir=Path(args.source).expanduser().resolve()
    out=Path(args.output).expanduser().resolve()
    out.mkdir(parents=True,exist_ok=True)
    if args.download:
        for rec in RECORD_IDS:
            fetch_if_missing(data_dir,rec)
    print("Extracting morphology from BIDMC v1.0.0...")
    proto,audit=collect_prototypes(data_dir,args.stride)
    partitions=group_patients(proto,args.seed)
    rng=np.random.default_rng(args.seed)
    metadata=[]
    for key,pool in partitions.items():
        assert pool, f"No eligible prototype for {key}"
        metadata.extend(draw_split(key,pool,out,rng))
    ids={key:set(p["patient"] for p in pool) for key,pool in partitions.items()}
    assert ids["train"].isdisjoint(ids["val"]) and ids["train"].isdisjoint(ids["test"])
    assert ids["val"].isdisjoint(ids["test"])
    save_real_holdout(partitions["test"],out)
    if not args.no_plots:
        figures(out)
    report={
        "type":"BIDMC-informed semi-synthetic PPG; not 10,000 independent original clinical recordings",
        "source":"https://physionet.org/content/bidmc/1.0.0/",
        "source_license":"Open Data Commons Attribution License v1.0",
        "source_dataset_doi":"10.13026/C2208R",
        "upstream_repo":"https://github.com/RAj5517/ppg_heart_rate_estimator",
        "sampling_hz":FS,"window_seconds":WIN_SEC,"window_samples":N,
        "seed":args.seed,"candidate_stride_sec":args.stride,
        "filter":"3rd-order Butterworth 0.45-8 Hz, zero-phase sosfiltfilt",
        "normalization":"per-window min-max [0,1]",
        "annotation":"median ECG-derived HR in matching 8 s; PULSE agreement as QC",
        "synthetic_label":"source ECG HR plus small variation; pulse frequency follows label",
        "split_pre_augmentation":"grouped by MIMIC II matched wdb ID from Fix.txt",
        "sources":{k:{"patients":len(ids[k]),"accepted_real_windows":len(partitions[k]),
                      "records":len(set(p["record"] for p in partitions[k]))} for k in SPLIT_SPEC},
        "counts":{k:{"clean":SPLIT_SPEC[k][0],"noisy":SPLIT_SPEC[k][1],
                      "total":sum(SPLIT_SPEC[k])} for k in SPLIT_SPEC},
        "records_audit":audit,
        "output_sha256":{f"{part}_{k}.npy":sha256(out/f"{part}_{k}.npy")
                         for part in ["X","y"] for k in SPLIT_SPEC},
        "notes":["Synthetic metrics do not imply clinical accuracy.",
                 "Clean labels mean low injected noise, not clinically artifact-free.",
                 "BIDMC held-out real windows are separate from the 10,000 synthetic windows.",
                 "The 45-150 BPM interval is a design inclusion bound.",
                 "Deployed preprocessing must match training filters and normalization."]
    }
    (out/"dataset_report.json").write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding="utf-8")
    pd.DataFrame(audit).to_csv(out/"extraction_audit.csv",index=False)
    print(f"Saved to {out}; distinct patient IDs={len(set(p['patient'] for p in proto))}")
    print("Synthetic samples:",len(metadata))


def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source",default="bidmc_raw")
    ap.add_argument("--output",default="data")
    ap.add_argument("--download",action="store_true")
    ap.add_argument("--stride",type=int,default=4)
    ap.add_argument("--seed",type=int,default=42)
    ap.add_argument("--no-plots",action="store_true")
    args=ap.parse_args()
    if args.stride<1 or args.stride>8:
        ap.error("--stride must be between 1 and 8 seconds")
    run(args)


if __name__=="__main__":
    main()
