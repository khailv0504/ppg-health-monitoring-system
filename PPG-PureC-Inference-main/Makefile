CC ?= gcc
CFLAGS ?= -O3 -std=c11 -Wall -Wextra -Werror -ffp-contract=off
all: build/ppg_infer build/libppg.so
build:
	mkdir -p build
build/ppg_infer: c/ppg.c c/ppg_io.c c/main.c c/ppg.h c/ppg_io.h | build
	$(CC) $(CFLAGS) -Ic c/ppg.c c/ppg_io.c c/main.c -lm -o $@
build/libppg.so: c/ppg.c c/ppg_io.c c/ppg.h c/ppg_io.h | build
	$(CC) $(CFLAGS) -fPIC -shared -Ic c/ppg.c c/ppg_io.c -lm -o $@
clean:
	rm -rf build
.PHONY: all clean
