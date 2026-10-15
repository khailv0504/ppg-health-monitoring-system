"""Development tests: full C vs Keras, negative BN gamma, malformed weights.
These tests do not establish real-sensor BPM accuracy.
"""
import os
os.environ.setdefault('TF_CPP_MIN_LOG_LEVEL','2')
import sys,unittest,tempfile,subprocess,ctypes
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import numpy as np
import tensorflow as tf
from model import build_ppg_model
from export_weights import export,normalize
from c_bridge import CEngine
from data_pipeline import prepare
tf.config.threading.set_intra_op_parallelism_threads(1)
tf.config.threading.set_inter_op_parallelism_threads(1)

class Equivalence(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        subprocess.run(['make','-C',str(ROOT)],check=True)
        tf.keras.utils.set_random_seed(123)
        cls.model=build_ppg_model()
        rng=np.random.default_rng(234)
        for j in range(1,4):
            bn=cls.model.get_layer(f'bn{j}');n=len(bn.get_weights()[0])
            bn.set_weights([rng.uniform(-2,2,n).astype('f4'),rng.normal(0,.3,n).astype('f4'),
                            rng.normal(0,.2,n).astype('f4'),rng.uniform(.1,2,n).astype('f4')])
        cls.tmp=tempfile.TemporaryDirectory();cls.path=Path(cls.tmp.name)
        export(cls.model,cls.path);cls.engine=CEngine(ROOT/'build/libppg.so',cls.path/'model_weights.bin')
    @classmethod
    def tearDownClass(cls):cls.tmp.cleanup()
    def test_full_model(self):
        rng=np.random.default_rng(9);t=np.arange(1000)/125
        windows=[rng.normal(size=1000).astype('f4') for _ in range(12)]
        windows += [np.zeros(1000),np.ones(1000)*100000,1e-6*np.sin(t),
                    100000+100*np.sin(t),np.sin(2*np.pi*.75*t),np.sin(2*np.pi*2.5*t)]
        x=np.array(windows,dtype='f4')[...,None]
        ref=self.model(normalize(x),training=False).numpy().ravel()
        got=np.array([self.engine(v) for v in x])
        err=np.max(np.abs(got-ref));print('Negative-gamma BN / full model max diff:',err)
        self.assertLess(err,1e-4)
    def test_window_state_reset(self):
        x=np.linspace(0,1,1000,dtype='f4');a=self.engine(x)
        self.engine(x[::-1]);self.assertEqual(self.engine(x),a)
    def test_nan_inf_rejected(self):
        for bad in (np.nan,np.inf,-np.inf):
            x=np.zeros(1000,dtype='f4');x[400]=bad
            with self.assertRaises(ValueError):self.engine(x)
    def test_weight_corruption(self):
        original=(self.path/'model_weights.bin').read_bytes()
        for i,data in enumerate([original[:100],b'badmagic'+original[8:],original+b'x',
                                 original[:50]+bytes([original[50]^1])+original[51:]]):
            p=self.path/f'bad{i}.bin';p.write_bytes(data)
            with self.assertRaises(RuntimeError):CEngine(ROOT/'build/libppg.so',p)
    def test_subject_disjoint(self):
        p=self.path/'real.npz'
        np.savez(p,X=np.zeros((40,1000),dtype='f4'),y_bpm=np.ones(40)*75,
                 subject_id=np.repeat(np.arange(10),4),fs_hz=125)
        split,meta=prepare('real_npz',p,self.path/'split')
        sets=[set(v[3]) for v in split.values()]
        self.assertTrue(all(not sets[i]&sets[j] for i in range(3) for j in range(i+1,3)))
        self.assertEqual(sum(map(len,(v[0] for v in split.values()))),40)
    def test_generated_header(self):
        src=self.path/'check.c'
        src.write_text('#include "model_weights.h"\nint main(void) { return sizeof(ppg_trained_model)!=PPG_WEIGHTS*4; }\n')
        exe=self.path/'check'
        subprocess.run(['cc','-std=c11','-Wall','-Werror','-I',str(ROOT/'c'),'-I',str(self.path),str(src),'-o',str(exe)],check=True)
        subprocess.run([str(exe)],check=True)

if __name__=='__main__':unittest.main(verbosity=2)
