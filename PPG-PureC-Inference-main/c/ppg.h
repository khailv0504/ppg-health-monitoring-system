#ifndef PPG_H
#define PPG_H
#include <stddef.h>
#define PPG_N 1000
#define PPG_WEIGHTS 25281
/* Float32 binary layout, channels-last; weights are read-only during inference. */
typedef struct {
    float c1[7*1*16], b1[16], s1[16], t1[16];
    float c2[5*16*32], b2[32], s2[32], t2[32];
    float c3[3*32*64], b3[64], s3[64], t3[64];
    float k1[64*128], r1[32*128], lb1[128];
    float k2[32*64], r2[16*64], lb2[64];
    float d1[16*32], db1[32], d2[32], db2[1];
} ppg_model;
typedef struct {
    float a[8000], b[8000], input[1000];
    float h1[32], state1[32], h2[16], state2[16];
    float gates[128], pair[128], dense[32];
} ppg_workspace;
/* Normalization = (x-min)/(max-min+1e-8), in both Python and C.
 * Input must already be 1000 chronological samples at 125 Hz.
 * 0 = success; -1 = invalid/nonfinite argument. State resets each window.
 * No heap allocations, file IO, framework, or global mutable state here. */
int ppg_infer(const ppg_model *m, ppg_workspace *w,
              const float input[PPG_N], float *bpm);
size_t ppg_model_bytes(void);
size_t ppg_workspace_bytes(void);
#endif
