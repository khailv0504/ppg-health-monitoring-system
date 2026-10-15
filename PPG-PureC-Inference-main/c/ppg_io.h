#ifndef PPG_IO_H
#define PPG_IO_H
#include "ppg.h"
/* Host-side loader; MCU can use generated const ppg_model instead. */
int ppg_load(const char *path,ppg_model *model);
#endif
