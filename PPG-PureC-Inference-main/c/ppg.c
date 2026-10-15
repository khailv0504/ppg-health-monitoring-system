#include "ppg.h"
#include <math.h>
#include <string.h>
_Static_assert(sizeof(float)==4, "FP32 required");
_Static_assert(sizeof(ppg_model)==PPG_WEIGHTS*4, "weight layout mismatch");
size_t ppg_model_bytes(void) { return sizeof(ppg_model); }
size_t ppg_workspace_bytes(void) { return sizeof(ppg_workspace); }

/* SAME cross-correlation, ReLU, then affine BN, then VALID pool(2).
 * Computes two convolution outputs at a time: no full Conv/BN activations.
 * BN is deliberately AFTER ReLU, preserving the upstream architecture. */
static void block(const float *x, int n, int ci, int co, int ks,
                  const float *k, const float *bias,
                  const float *scale, const float *shift,
                  float *y, float *pair) {
    for (int t=0; t<n/2; ++t) {
        for (int p=0; p<2; ++p) {
            float *v=pair+p*co;
            memcpy(v,bias,(size_t)co*sizeof(float));
            for (int j=0; j<ks; ++j) {
                int pos=2*t+p+j-ks/2;
                if (pos<0 || pos>=n) continue;
                for (int ic=0; ic<ci; ++ic) {
                    float a=x[pos*ci+ic];
                    const float *row=k+(j*ci+ic)*co;
                    for (int oc=0; oc<co; ++oc) v[oc]+=a*row[oc];
                }
            }
            for (int oc=0; oc<co; ++oc)
                v[oc]=scale[oc]*fmaxf(v[oc],0.0f)+shift[oc];
        }
        for (int oc=0; oc<co; ++oc)
            y[t*co+oc]=fmaxf(pair[oc],pair[co+oc]);
    }
}
static float sigmoid(float x) {
    if (x>=0.0f) return 1.0f/(1.0f+expf(-x));
    float a=expf(x); return a/(1.0f+a);
}
/* Keras gate order: input, forget, cell candidate, output (i,f,c,o).
 * Update h only AFTER computing all gates from previous h. */
static void lstm_step(const float *x,int ci,int hdim,const float *k,
                      const float *r,const float *bias,float *h,
                      float *cell,float *g) {
    int cols=4*hdim;
    memcpy(g,bias,(size_t)cols*sizeof(float));
    for (int j=0;j<ci;++j)
        for (int q=0;q<cols;++q) g[q]+=x[j]*k[j*cols+q];
    for (int j=0;j<hdim;++j)
        for (int q=0;q<cols;++q) g[q]+=h[j]*r[j*cols+q];
    for (int j=0;j<hdim;++j) {
        cell[j]=sigmoid(g[hdim+j])*cell[j]
                +sigmoid(g[j])*tanhf(g[2*hdim+j]);
        h[j]=sigmoid(g[3*hdim+j])*tanhf(cell[j]);
    }
}
int ppg_infer(const ppg_model *m,ppg_workspace *w,
              const float input[PPG_N],float *bpm) {
    if (!m || !w || !input || !bpm) return -1;
    /* Double arithmetic avoids overflow/cancellation in the sensor range.
     * Export/checkpoint reference uses the same min-max definition. */
    double lo=input[0],hi=input[0];
    for (int i=0;i<PPG_N;++i) {
        if (!isfinite(input[i])) return -1;
        if(input[i]<lo) lo=input[i];
        if(input[i]>hi) hi=input[i];
    }
    double denom=hi-lo+1e-8;
    for (int i=0;i<PPG_N;++i) w->input[i]=(float)((input[i]-lo)/denom);
    block(w->input,1000,1,16,7,m->c1,m->b1,m->s1,m->t1,w->a,w->pair);
    block(w->a,500,16,32,5,m->c2,m->b2,m->s2,m->t2,w->b,w->pair);
    block(w->b,250,32,64,3,m->c3,m->b3,m->s3,m->t3,w->a,w->pair);
    memset(w->h1,0,sizeof w->h1); memset(w->state1,0,sizeof w->state1);
    memset(w->h2,0,sizeof w->h2); memset(w->state2,0,sizeof w->state2);
    /* Stream LSTM1 outputs directly into LSTM2: no [125,32] buffer. */
    for (int t=0;t<125;++t) {
        lstm_step(w->a+t*64,64,32,m->k1,m->r1,m->lb1,w->h1,w->state1,w->gates);
        lstm_step(w->h1,32,16,m->k2,m->r2,m->lb2,w->h2,w->state2,w->gates);
    }
    for (int o=0;o<32;++o) {
        float v=m->db1[o];
        for (int i=0;i<16;++i) v+=w->h2[i]*m->d1[i*32+o];
        w->dense[o]=fmaxf(v,0.0f);
    }
    float result=m->db2[0];
    for (int i=0;i<32;++i) result+=w->dense[i]*m->d2[i];
    if (!isfinite(result)) return -1;
    *bpm=result; return 0;
}
