"""Train once, export the SAME checkpoint, validate C, benchmark CPU batch=1."""
import os
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL','2')
os.environ.setdefault('TF_DETERMINISTIC_OPS','1')
os.environ.setdefault('OMP_NUM_THREADS','1')
import argparse, json, platform, subprocess, time, csv, hashlib
from pathlib import Path
import numpy as np
import tensorflow as tf
from model import build_ppg_model
from export_weights import export,normalize
from data_pipeline import prepare
from c_bridge import CEngine

ROOT=Path(__file__).resolve().parent

def run(mode='synthetic',data_path='',n=10000,epochs=80,batch=64,seed=42,
        outdir='results',tolerance=0.05,benchmark_iters=300):
    if benchmark_iters<2 or epochs<1 or n<10 or tolerance<=0: raise ValueError('Invalid configuration')
    out=Path(outdir).resolve();out.mkdir(parents=True,exist_ok=True)
    tf.config.threading.set_inter_op_parallelism_threads(1)
    tf.config.threading.set_intra_op_parallelism_threads(1)
    for g in tf.config.list_physical_devices('GPU'): tf.config.experimental.set_memory_growth(g,True)
    tf.keras.utils.set_random_seed(seed)
    tf.keras.mixed_precision.set_global_policy('float32')
    splits,split_meta=prepare(mode,data_path,out,seed,n)
    model=build_ppg_model();model.summary()
    model.compile(optimizer=tf.keras.optimizers.Adam(1e-3),loss=tf.keras.losses.Huber(),metrics=['mae'])
    def ds(x,y,shuffle):
        d=tf.data.Dataset.from_tensor_slices((x,y[:,None]))
        if shuffle:d=d.shuffle(len(x),seed=seed,reshuffle_each_iteration=True)
        opts=tf.data.Options(); opts.threading.private_threadpool_size=2
        opts.experimental_deterministic=True
        return d.batch(batch).with_options(opts).prefetch(1)
    train=ds(splits['train'][1],splits['train'][2],True)
    val=ds(splits['val'][1],splits['val'][2],False)
    callbacks=[tf.keras.callbacks.ModelCheckpoint(str(out/'best_model.keras'),monitor='val_mae',mode='min',save_best_only=True),
               tf.keras.callbacks.EarlyStopping(monitor='val_mae',mode='min',patience=15,restore_best_weights=True),
               tf.keras.callbacks.ReduceLROnPlateau(monitor='val_mae',mode='min',patience=7,factor=0.5,min_lr=1e-6)]
    t=time.perf_counter();hist=model.fit(train,validation_data=val,epochs=epochs,callbacks=callbacks,verbose=2)
    train_seconds=time.perf_counter()-t
    model=tf.keras.models.load_model(out/'best_model.keras',compile=False)
    manifest=export(model,out)
    (out/'history.json').write_text(json.dumps(hist.history,indent=2))
    subprocess.run(['make','-C',str(ROOT)],check=True)
    engine=CEngine(ROOT/'build/libppg.so',out/'model_weights.bin')
    # Force comparison/benchmark to a CPU model, even when training used GPU.
    with tf.device('/CPU:0'):
        cpu_model=build_ppg_model();cpu_model.set_weights(model.get_weights())
    @tf.function(input_signature=[tf.TensorSpec([1,1000,1],tf.float32)])
    def reference(x):
        with tf.device('/CPU:0'):return cpu_model(x,training=False)
    raw,xnorm,y,groups=splits['test']
    keras_pred=np.array([float(reference(v[None]).numpy()[0,0]) for v in xnorm])
    c_pred=np.array([engine(v) for v in raw])
    diff=np.abs(c_pred-keras_pred)
    def model_metrics(p):
        e=np.abs(p-y);return {'mae_bpm':float(e.mean()),'rmse_bpm':float(np.sqrt(np.mean((p-y)**2))),
        'p95_abs_error_bpm':float(np.percentile(e,95)),'within_5bpm_fraction':float(np.mean(e<=5))}
    # Edge cases test IMPLEMENTATION equivalence; they do not establish signal validity.
    rng=np.random.default_rng(seed+1);tt=np.arange(1000)/125
    stress={'zero':np.zeros(1000),'constant_dc':np.full(1000,100000.0),
            'tiny_signal':1e-6*np.sin(2*np.pi*tt),
            'large_dc':100000+100*np.sin(2*np.pi*1.5*tt),
            'low_bpm_45':np.sin(2*np.pi*0.75*tt),
            'high_bpm_150':np.sin(2*np.pi*2.5*tt),'random':rng.normal(size=1000)}
    stress_results=[]
    for name,v in stress.items():
        v=np.asarray(v,np.float32);xn=normalize(v[None,:,None])
        kp=float(reference(xn).numpy()[0,0]);cp=engine(v)
        stress_results.append({'name':name,'keras_bpm':kp,'c_bpm':cp,'abs_diff_bpm':abs(cp-kp)})
    try:engine(np.full(1000,np.nan,np.float32))
    except ValueError:pass
    else:raise AssertionError('C must reject NaN')
    passed=bool(diff.max()<=tolerance and all(r['abs_diff_bpm']<=tolerance for r in stress_results))
    numerical={'test_windows':len(y),'split':split_meta,'keras':model_metrics(keras_pred),'pure_c':model_metrics(c_pred),
               'max_abs_diff_bpm':float(diff.max()),'mean_abs_diff_bpm':float(diff.mean()),
               'p95_abs_diff_bpm':float(np.percentile(diff,95)),'tolerance_bpm':tolerance,'pass':passed,
               'stress':stress_results}
    with (out/'predictions.csv').open('w',newline='') as f:
        wr=csv.writer(f);wr.writerow(['test_index','subject_or_simulation_id','true_bpm','keras_bpm','c_bpm','abs_diff_bpm'])
        wr.writerows(zip(range(len(y)),groups,y,keras_pred,c_pred,diff))
    np.savetxt(out/'first_test_window.csv',raw[0,:,0],fmt='%.9g')
    np.savez_compressed(out/'test_vectors.npz',X=raw,y_bpm=y,subject_id=groups,
                        keras_bpm=keras_pred,c_bpm=c_pred,fs_hz=np.int32(125))
    (out/'numerical_report.json').write_text(json.dumps(numerical,indent=2))
    if not passed:raise AssertionError('C-Keras comparison FAILED; see numerical_report.json. Do not benchmark a failed engine.')
    # Paired CPU wall-clock measurements: normalization included on BOTH paths.
    # Reference includes NumPy normalization, TensorFlow dispatch and .numpy() sync.
    # C includes Python/ctypes dispatch, normalization and native inference.
    sample=raw[0:1]
    def py_call():return float(reference(normalize(sample)).numpy()[0,0])
    def c_call():return engine(sample)
    for _ in range(20):py_call();c_call()
    timings={'keras':[],'pure_c':[]}
    for i in range(benchmark_iters):
        calls=[('keras',py_call),('pure_c',c_call)]
        if i%2:calls.reverse()
        for name,fn in calls:
            start=time.perf_counter_ns();fn();timings[name].append((time.perf_counter_ns()-start)/1e6)
    summary={k:{'p50_ms':float(np.percentile(v,50)),'p95_ms':float(np.percentile(v,95)),
                'mean_ms':float(np.mean(v))} for k,v in timings.items()}
    summary['p50_speedup']=summary['keras']['p50_ms']/summary['pure_c']['p50_ms']
    env={'tensorflow':tf.__version__,'numpy':np.__version__,'python':platform.python_version(),
         'platform':platform.platform(),'logical_cpus':os.cpu_count(),'tf_intra_threads':1,'tf_inter_threads':1,
         'compiler':subprocess.check_output(['cc','--version'],text=True).splitlines()[0],
         'compile_flags':'-O3 -std=c11 -ffp-contract=off; no fast-math',
         'hardware_benchmark':'host CPU only; not MCU','batch':1,'warmup':20,'iterations':benchmark_iters,
         'timing_scope':'wall clock including per-window normalization and Python dispatch on both paths',
         'train_seconds':train_seconds,'config':dict(mode=mode,n=n,epochs=epochs,batch=batch,seed=seed),
         'upstream_commit':'649e3f2e92ab82738428cfd7d06d1187669442ab'}
    if Path('/proc/cpuinfo').exists():
        env['cpu_model']=next((s.split(':',1)[1].strip() for s in Path('/proc/cpuinfo').read_text().splitlines() if s.startswith('model name')),'unknown')
    memory={'weight_payload_bytes':manifest['weight_payload_bytes'],
            'model_struct_bytes':engine.lib.ppg_model_bytes(),'workspace_struct_bytes':engine.lib.ppg_workspace_bytes(),
            'note':'Static structures, NOT peak process RSS. MCU flash/linker usage must be measured separately.'}
    (out/'benchmark_report.json').write_text(json.dumps({'environment':env,'latency':summary,'memory':memory},indent=2))
    with (out/'timings_ms.csv').open('w',newline='') as f:
        wr=csv.writer(f);wr.writerow(['iteration','keras_ms','pure_c_ms'])
        wr.writerows(zip(range(benchmark_iters),timings['keras'],timings['pure_c']))
    # Verify the portable initializer compiles, not just the binary export.
    check=out/'header_check.c';check.write_text('#include "model_weights.h"\nint main(void){return sizeof(ppg_trained_model)!=PPG_WEIGHTS*4;}\n')
    subprocess.run(['cc','-std=c11','-Wall','-Werror','-I',str(ROOT/'c'),'-I',str(out),str(check),'-o',str(out/'header_check')],check=True)
    subprocess.run([str(out/'header_check')],check=True)
    check.unlink();(out/'header_check').unlink()
    print(json.dumps({'numerical':{k:v for k,v in numerical.items() if k not in ['stress','split']},
                      'benchmark':summary,'memory':memory},indent=2))
    return numerical,summary

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--mode',choices=['synthetic','real_npz'],default='synthetic')
    p.add_argument('--data-path',default='');p.add_argument('--n',type=int,default=10000)
    p.add_argument('--epochs',type=int,default=80);p.add_argument('--batch',type=int,default=64)
    p.add_argument('--seed',type=int,default=42);p.add_argument('--outdir',default='results')
    p.add_argument('--tolerance',type=float,default=0.05);p.add_argument('--benchmark-iters',type=int,default=300)
    run(**vars(p.parse_args()))
