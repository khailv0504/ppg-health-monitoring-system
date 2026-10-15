"""Strict exporter for the fixed upstream CNN/LSTM; no TensorFlow runtime in C.
Conv weights: [kernel,input,output]; LSTM [input,4H], [H,4H], gate i,f,c,o.
"""
from pathlib import Path
import json, struct, hashlib, zlib
import numpy as np

COUNT = 25281
ARCH = [(7,1,16),(5,16,32),(3,32,64)]

def normalize(x):
    x = np.asarray(x, dtype=np.float32)
    if x.ndim == 2: x = x[...,None]
    if x.ndim != 3 or x.shape[1:] != (1000,1) or not np.isfinite(x).all():
        raise ValueError('Expected finite float32 [N,1000,1] input')
    # Float64 arithmetic mirrors the C preprocessing before final FP32 cast.
    d=x.astype(np.float64); lo=d.min(axis=1,keepdims=True)
    return ((d-lo)/(d.max(axis=1,keepdims=True)-lo+1e-8)).astype(np.float32)

def export(model, outdir):
    outdir=Path(outdir); outdir.mkdir(parents=True,exist_ok=True)
    expected=['ppg_input','conv1','bn1','pool1','conv2','bn2','pool2',
              'conv3','bn3','pool3','lstm1','drop_lstm','lstm2',
              'dense1','drop_dense','hr_output']
    assert [l.name for l in model.layers]==expected, 'Unsupported model graph'
    assert model.input_shape == (None,1000,1) and model.output_shape==(None,1)
    arrays=[]; names=[]
    def add(name,a,shape):
        a=np.asarray(a,dtype='<f4'); assert a.shape==shape,(name,a.shape,shape)
        assert np.isfinite(a).all(),name
        arrays.append(a); names.append(name)
    for j,(ks,ci,co) in enumerate(ARCH,1):
        conv=model.get_layer(f'conv{j}'); cfg=conv.get_config()
        assert cfg['padding']=='same' and cfg['activation']=='relu'
        assert tuple(cfg['strides'])==(1,) and tuple(cfg['dilation_rate'])==(1,)
        assert cfg.get('groups',1)==1 and cfg['use_bias']
        assert cfg.get('data_format','channels_last')=='channels_last'
        k,b=conv.get_weights(); add(f'c{j}',k,(ks,ci,co)); add(f'b{j}',b,(co,))
        bn=model.get_layer(f'bn{j}'); bc=bn.get_config()
        assert bc['center'] and bc['scale'] and bc['axis'] in (-1,[-1])
        gamma,beta,mean,var=bn.get_weights()
        # Precompute affine BN AFTER ReLU; do NOT fold through the activation.
        scale=(gamma/np.sqrt(var+bn.epsilon)).astype(np.float32)
        shift=(beta-mean*scale).astype(np.float32)
        add(f's{j}',scale,(co,)); add(f't{j}',shift,(co,))
        pc=model.get_layer(f'pool{j}').get_config()
        assert tuple(pc['pool_size'])==(2,) and tuple(pc['strides'])==(2,)
        assert pc['padding']=='valid'
    for j,ci,h in [(1,64,32),(2,32,16)]:
        layer=model.get_layer(f'lstm{j}'); cfg=layer.get_config()
        assert cfg['units']==h and cfg['activation']=='tanh'
        assert cfg['recurrent_activation']=='sigmoid' and cfg['use_bias']
        assert not cfg['stateful'] and not cfg['go_backwards']
        assert cfg['return_sequences']==(j==1) and not cfg['return_state']
        k,r,b=layer.get_weights()
        add(f'k{j}',k,(ci,4*h)); add(f'r{j}',r,(h,4*h)); add(f'lb{j}',b,(4*h,))
    for layer,name,ci,co,act in [('dense1','d1',16,32,'relu'),('hr_output','d2',32,1,'linear')]:
        l=model.get_layer(layer); assert l.get_config()['activation']==act
        k,b=l.get_weights(); add(name,k,(ci,co)); add('db'+name[-1],b,(co,))
    data=np.concatenate([a.reshape(-1) for a in arrays]).astype('<f4').tobytes()
    assert len(data)==COUNT*4
    blob=b'PPGCv001'+struct.pack('<IIII',1000,125,COUNT,zlib.crc32(data))+data
    (outdir/'model_weights.bin').write_bytes(blob)
    # Flash-resident typed initializer: allows MCU inference without file IO/loader.
    with (outdir/'model_weights.h').open('w') as f:
        f.write('#ifndef PPG_GENERATED_WEIGHTS_H\n#define PPG_GENERATED_WEIGHTS_H\n#include "ppg.h"\n')
        f.write('/* Define this header in ONE translation unit. */\nstatic const ppg_model ppg_trained_model = {\n')
        for name,a in zip(names,arrays):
            f.write(' .'+name+' = {\n')
            vals=[float(v).hex()+'f' for v in a.reshape(-1)]
            for i in range(0,len(vals),8): f.write('  '+', '.join(vals[i:i+8])+',\n')
            f.write(' },\n')
        f.write('};\n#endif\n')
    offset=0; tensors=[]
    for name,a in zip(names,arrays):
        tensors.append(dict(name=name,shape=list(a.shape),offset_floats=offset,count=a.size))
        offset+=a.size
    info=dict(format='PPGCv001',dtype='IEEE754 float32 little endian',fs_hz=125,window_samples=1000,
              preprocessing='per-window minmax: (x-min)/(max-min+1e-8), float64 arithmetic then FP32',
              weight_floats=COUNT,weight_payload_bytes=len(data),binary_bytes=len(blob),
              model_params=int(model.count_params()),bn='affine after ReLU, not folded into Conv',
              lstm_gate_order='i,f,c,o',sha256=hashlib.sha256(blob).hexdigest(),tensors=tensors)
    (outdir/'weights_manifest.json').write_text(json.dumps(info,indent=2))
    return info
