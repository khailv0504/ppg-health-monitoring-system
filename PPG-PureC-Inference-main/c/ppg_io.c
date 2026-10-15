#include "ppg_io.h"
#include <stdio.h>
#include <stdint.h>
#include <string.h>
#include <math.h>
static uint32_t u32(const unsigned char *p) {
    return (uint32_t)p[0]|((uint32_t)p[1]<<8)|((uint32_t)p[2]<<16)|((uint32_t)p[3]<<24);
}
static uint32_t crc32(const unsigned char *p,size_t n) {
    uint32_t c=0xffffffffu;
    for(size_t i=0;i<n;++i) {
        c^=p[i];
        for(int j=0;j<8;++j) c=(c>>1)^(0xedb88320u & (0u-(c&1u)));
    }
    return c^0xffffffffu;
}
int ppg_load(const char *path,ppg_model *m) {
    if(!path||!m) return -1;
    FILE *f=fopen(path,"rb"); if(!f) return -2;
    unsigned char h[24];
    if(fread(h,1,24,f)!=24 || memcmp(h,"PPGCv001",8)
       || u32(h+8)!=1000 || u32(h+12)!=125 || u32(h+16)!=PPG_WEIGHTS) {
        fclose(f);return -3;
    }
    if(fread(m,1,sizeof *m,f)!=sizeof *m || fgetc(f)!=EOF) {fclose(f);return -4;}
    fclose(f);
    unsigned char *p=(unsigned char *)m;
    if(crc32(p,sizeof *m)!=u32(h+20)) return -5;
    for(size_t i=0;i<PPG_WEIGHTS;++i) {
        uint32_t bits=u32(p+4*i); float value;
        memcpy(&value,&bits,4);
        if(!isfinite(value)) return -6;
        memcpy(p+4*i,&value,4); /* Supports both little and big endian hosts. */
    }
    return 0;
}
