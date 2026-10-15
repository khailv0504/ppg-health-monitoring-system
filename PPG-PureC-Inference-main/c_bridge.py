from pathlib import Path
import ctypes as ct
import numpy as np

class CEngine:
    def __init__(self, library, weights):
        self.lib=ct.CDLL(str(Path(library).resolve()))
        self.lib.ppg_model_bytes.restype=ct.c_size_t
        self.lib.ppg_workspace_bytes.restype=ct.c_size_t
        # c_float arrays guarantee alignment. Workspaces belong to this instance.
        self.model=(ct.c_float*(self.lib.ppg_model_bytes()//4))()
        self.work=(ct.c_float*(self.lib.ppg_workspace_bytes()//4))()
        self.lib.ppg_load.argtypes=[ct.c_char_p,ct.c_void_p]; self.lib.ppg_load.restype=ct.c_int
        self.lib.ppg_infer.argtypes=[ct.c_void_p,ct.c_void_p,ct.c_void_p,ct.POINTER(ct.c_float)]
        self.lib.ppg_infer.restype=ct.c_int
        rc=self.lib.ppg_load(str(Path(weights).resolve()).encode(),self.model)
        if rc:raise RuntimeError(f'C weight load failed: {rc}: {weights}')
    def __call__(self,x):
        x=np.ascontiguousarray(x,dtype=np.float32)
        if x.size!=1000:raise ValueError('Need exactly 1000 raw samples')
        out=ct.c_float()
        rc=self.lib.ppg_infer(self.model,self.work,x.ctypes.data,ct.byref(out))
        if rc:raise ValueError(f'C inference failed: {rc}')
        return out.value
