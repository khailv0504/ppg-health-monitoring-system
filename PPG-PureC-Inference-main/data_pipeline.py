"""Synthetic demo OR externally supplied subject-labelled real PPG NPZ."""
import hashlib, json
from pathlib import Path
import numpy as np
from export_weights import normalize

def synthetic(n=10000,seed=42):
    """Adapted from upstream prepare_data.py; chronological samples at exact 125Hz.
    Independent simulations; there are no human subjects in this mode.
    """
    rng=np.random.default_rng(seed); t=np.arange(1000)/125.0
    x=np.empty((n,1000,1),np.float32); y=np.empty(n,np.float32)
    noisy=rng.random(n)<0.2
    for i in range(n):
        hr=rng.uniform(50,130) if noisy[i] else rng.uniform(45,150)
        freq=hr/60; y[i]=hr
        v=np.sin(2*np.pi*freq*t)+0.35*np.sin(4*np.pi*freq*t+0.6)+0.1*np.sin(6*np.pi*freq*t+0.3)
        v+=0.15*np.sin(2*np.pi*rng.uniform(0.2,0.35)*t)
        v+=rng.normal(0,rng.uniform(0.05,0.15) if noisy[i] else rng.uniform(0.02,0.08),1000)
        if noisy[i]: v+=rng.uniform(0.2,0.5)*np.sin(2*np.pi*rng.uniform(0.5,2.5)*t)
        x[i,:,0]=v
    return x,y,noisy

def prepare(mode, path, outdir, seed=42,n=10000):
    rng=np.random.default_rng(seed); outdir=Path(outdir);outdir.mkdir(parents=True,exist_ok=True)
    if mode=='synthetic':
        x,y,noisy=synthetic(n,seed); groups=np.arange(n).astype(str)
        ids=rng.permutation(n); ntest=max(1,int(n*0.15));nval=max(1,int(n*0.15))
        splits={'test':ids[:ntest],'val':ids[ntest:ntest+nval],'train':ids[ntest+nval:]}
        provenance={'kind':'synthetic','generator':'adapted upstream harmonic generator; exact arange/125 time axis',
                    'human_subjects':0,'split_unit':'independent simulation','noise_fraction':float(noisy.mean())}
    elif mode=='real_npz':
        p=Path(path)
        with np.load(p,allow_pickle=False) as d:
            required={'X','y_bpm','subject_id','fs_hz'}
            if not required.issubset(d.files): raise ValueError(f'NPZ needs {required}')
            if float(np.asarray(d['fs_hz']).item())!=125: raise ValueError('Resample to 125Hz BEFORE creating windows')
            x=np.asarray(d['X'],np.float32); y=np.asarray(d['y_bpm'],np.float32)
            groups=np.asarray(d['subject_id']).astype(str)
        if x.ndim==2:x=x[...,None]
        if y.ndim!=1 or groups.ndim!=1 or len(y)!=len(x) or len(groups)!=len(x):
            raise ValueError('X, y_bpm, subject_id must have matching sample counts')
        subjects=rng.permutation(np.unique(groups)); ng=len(subjects)
        if ng<5:raise ValueError('Need at least 5 subjects for a meaningful train/val/test demo')
        nt=max(1,round(0.15*ng));nv=max(1,round(0.15*ng))
        sets={'test':subjects[:nt],'val':subjects[nt:nt+nv],'train':subjects[nt+nv:]}
        splits={k:np.flatnonzero(np.isin(groups,v)) for k,v in sets.items()}
        assert not set(sets['train']) & set(sets['val'])
        assert not set(sets['train']) & set(sets['test'])
        assert not set(sets['val']) & set(sets['test'])
        provenance={'kind':'real_npz','split_unit':'subject_id','input_path':str(p),
                    'input_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
                    'subjects':{k:v.tolist() for k,v in sets.items()},
                    'source_note':'User supplies dataset source, label alignment and license; not inferred from NPZ'}
    else: raise ValueError('mode must be synthetic or real_npz')
    if len(x)<10 or any(len(v)==0 for v in splits.values()):raise ValueError('Empty/small split')
    if not np.isfinite(y).all() or np.any(y<=0): raise ValueError('Invalid BPM labels')
    xn=normalize(x) # Validates finite X and exact shape.
    meta={'seed':seed,'fs_hz':125,'window_samples':1000,'provenance':provenance,
          'windows':{k:len(v) for k,v in splits.items()}}
    np.savez_compressed(outdir/'split_indices.npz',**splits)
    (outdir/'split_manifest.json').write_text(json.dumps(meta,indent=2))
    return {k:(x[v],xn[v],y[v],groups[v]) for k,v in splits.items()},meta
