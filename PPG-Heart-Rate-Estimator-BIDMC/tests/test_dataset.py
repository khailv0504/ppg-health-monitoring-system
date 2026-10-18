"""Offline fixture test: verifies pipeline logic, NOT actual BIDMC clinical validity."""
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import sys
import numpy as np
import pandas as pd
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from data import prepare_data as p

def test_synthetic_fixture():
    rng=np.random.default_rng(200)
    with TemporaryDirectory() as d:
        root=Path(d); source=root/"source"; target=root/"data"; source.mkdir()
        for rec in range(1,10):
            key=f"bidmc_{rec:02d}"
            bpm=60+5*rec
            t=np.arange(125*60)/125; f=bpm/60
            wave=np.sin(2*np.pi*f*t)+.28*np.sin(4*np.pi*f*t+.5)+.08*np.sin(6*np.pi*f*t+.1)+.04*rng.standard_normal(len(t))
            pd.DataFrame({"Time [s]":t,"PLETH":wave,"II":np.zeros(len(t))}).to_csv(source/f"{key}_Signals.csv",index=False)
            pd.DataFrame({"Time [s]":np.arange(60),"HR":np.full(60,bpm),
                          "PULSE":np.full(60,bpm),"RESP":np.full(60,18),
                          "SpO2":np.full(60,97)}).to_csv(source/f"{key}_Numerics.csv",index=False)
            (source/f"{key}_Fix.txt").write_text(f"{key}\nMIMIC II matched wdb ID: sid_{rec:02d}\n")
        old_ids=p.RECORD_IDS
        try:
            p.RECORD_IDS=range(1,10)
            p.run(SimpleNamespace(source=str(source),output=str(target),
                                  download=False,stride=4,seed=42,no_plots=False))
        finally:
            p.RECORD_IDS=old_ids
        subject_sets=[]
        for split,(clean,noisy) in p.SPLIT_SPEC.items():
            X=np.load(target/f"X_{split}.npy")
            y=np.load(target/f"y_{split}.npy")
            df=pd.read_csv(target/f"metadata_{split}.csv")
            assert X.shape==(clean+noisy,1000) and y.shape==(clean+noisy,)
            assert np.isfinite(X).all() and (X>=0).all() and (X<=1).all()
            assert (df.category=="clean").sum()==clean
            assert (df.category=="noisy").sum()==noisy
            subject_sets.append(set(df.source_patient))
        assert not(subject_sets[0]&subject_sets[1])
        assert not(subject_sets[0]&subject_sets[2])
        assert not(subject_sets[1]&subject_sets[2])
        for fn in ["dataset_report.json","waveform_examples.png","hr_distribution.png",
                   "noise_snr_distribution.png","X_bidmc_real_test.npy"]:
            assert (target/fn).exists()
        print("PASS: 10k samples, split sizes, labels, patient separation, artifacts")

if __name__=="__main__":
    test_synthetic_fixture()
