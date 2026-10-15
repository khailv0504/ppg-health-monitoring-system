#include "ppg_io.h"
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
static ppg_model model;
static ppg_workspace work;
static float signal[PPG_N];
int main(int argc,char **argv) {
    if(argc!=3) {fprintf(stderr,"Usage: %s weights.bin raw_window.csv\n",argv[0]);return 2;}
    int rc=ppg_load(argv[1],&model);
    if(rc) {fprintf(stderr,"Weight load failed (%d): %s\n",rc,argv[1]);return 3;}
    FILE *f=fopen(argv[2],"r");if(!f){perror(argv[2]);return 4;}
    /* Exactly one scalar per line, no header. Reject malformed/extra values. */
    char line[256],*end;
    for(int i=0;i<PPG_N;++i) {
        if(!fgets(line,sizeof line,f)){fprintf(stderr,"Need exactly 1000 samples\n");fclose(f);return 5;}
        signal[i]=strtof(line,&end);
        if(end==line){fclose(f);return 5;}
        while(*end==' '||*end=='\t'||*end=='\r'||*end=='\n') ++end;
        if(*end || !isfinite(signal[i])){fprintf(stderr,"Invalid sample %d\n",i);fclose(f);return 5;}
    }
    if(fgets(line,sizeof line,f)){fprintf(stderr,"Extra input samples\n");fclose(f);return 5;}
    fclose(f);float bpm;
    if(ppg_infer(&model,&work,signal,&bpm)) return 6;
    printf("%.9g\n",(double)bpm);return 0;
}
