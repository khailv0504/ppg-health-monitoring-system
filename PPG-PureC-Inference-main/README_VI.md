# PPG CNN/LSTM: Kaggle training → FP32 export → Pure C inference

Bộ mã kế thừa kiến trúc `RAj5517/ppg_heart_rate_estimator`, không phải MEDVSE-FCN.
Input: **1.000 mẫu PPG liên tiếp @125Hz**, 8 giây, 1 kênh. Output: một giá trị BPM.
Không dự đoán SpO₂.

## 1. Cách chạy trên Kaggle

1. Import `PPG_Kaggle_Train_Export_PureC.ipynb` vào Kaggle Notebooks.
2. Chọn GPU nếu có. Notebook không tải code từ GitHub/Hugging Face, không yêu cầu
   cài phần mềm trên laptop. Kaggle cần có TensorFlow, NumPy và compiler C/make.
3. Giữ `MODE = 'synthetic'` cho lần đầu. Chạy Run All.
   Cấu hình mặc định: 10.000 windows, tối đa 80 epochs, batch 64, seed 42;
   early stopping theo validation MAE và luôn xuất checkpoint tốt nhất.
4. Kết quả nằm trong `/kaggle/working/ppg_c_project/results/`.
   Notebook đóng gói toàn bộ mã và kết quả thành `/kaggle/working/PPG_Kaggle_Result.zip`.
5. Tải file kết quả từ Output của phiên Kaggle; chọn Save Version/Run All để giữ output.

Nếu muốn kiểm tra notebook chạy hết trước khi train dài, đổi `N_SYNTHETIC=64`,
`EPOCHS=1`, `BATCH=8`, `BENCHMARK_ITERS=10`.
**Đây chỉ là smoke test; checkpoint đó chưa đủ huấn luyện để dự đoán BPM.**

## 2. Chạy C trên máy tính

Sau khi giải nén **PPG_Kaggle_Result.zip**, vào thư mục `ppg_c_project`:

```bash
make
./build/ppg_infer results/model_weights.bin results/first_test_window.csv
```

Output stdout là BPM. CSV phải có đúng 1.000 dòng, một giá trị float mỗi dòng,
không tiêu đề. C tự chuẩn hóa min–max, nên CSV chứa tín hiệu thô trước chuẩn hóa.
Đường dẫn là tương đối với thư mục đang đứng; không nhầm với ZIP nguồn chưa train.

Chạy training bằng CLI (trên cloud hoặc máy có TensorFlow):

```bash
python train_export_verify.py --mode synthetic --n 10000 --epochs 80 --outdir results
```

## 3. Dữ liệu và mức độ tái lập

Nguồn gốc:

- Model: https://huggingface.co/raj5517/ppg-heart-rate-estimator
- Source: https://github.com/RAj5517/ppg_heart_rate_estimator
- Generator: `data/prepare_data.py` trong repo gốc.
- README gốc ghi **synthetic dataset**, 8.000 clean + 2.000 noisy, và BIDMC là
  **intended dataset**. Không được ghi rằng model công bố đã train trên BIDMC.
- Generator mô phỏng nhịp bằng các hàm sin/harmonic, nhiễu Gaussian,
  respiratory modulation và motion artifact. Nhãn BPM chính là tham số tạo tín hiệu.
  Vì vậy MAE thấp trên dữ liệu này không chứng minh độ chính xác trên người thật.
- Giữ license MIT và mã tham chiếu trong `LICENSE_UPSTREAM`, `upstream_reference/`.

Pipeline mới giữ nguyên kiến trúc và Huber loss/Adam nhưng dùng RNG riêng,
thời gian chính xác `arange(1000)/125`, tỷ lệ noisy kỳ vọng 20%, split 70/15/15.
Do đó đây là **huấn luyện checkpoint riêng**, không phải tái tạo bit-for-bit
checkpoint hoặc số liệu 0,54 BPM của tác giả. Không sử dụng pretrained weight của
Hugging Face trong cấu hình mặc định. Trong chế độ tổng hợp không tồn tại subject ID thật.

### Chế độ dữ liệu thật, chống trùng người giữa các tập

Upload vào Kaggle một NPZ với schema sau; đổi `MODE='real_npz'`, `DATA_PATH=...`:

```python
np.savez_compressed('real_ppg.npz',
    X=raw_ppg_windows.astype(np.float32),  # [N,1000] hoặc [N,1000,1]
    y_bpm=reference_bpm.astype(np.float32), # [N], nhãn tham chiếu độc lập
    subject_id=subject_ids.astype(str),    # [N], cùng người phải cùng ID
    fs_hz=np.int32(125))
```

NPZ cần ít nhất 5 subject. Split theo subject, xấp xỉ 70/15/15 số người,
không phải số windows. Các cửa sổ chồng lấp cùng người sẽ nằm cùng một tập.
Notebook ghi danh sách subject và chỉ số windows vào manifest. Dữ liệu phải
được resample và căn chỉnh nhãn **trước** bước tạo cửa sổ; adapter không suy đoán
tần số lấy mẫu, không tạo nhãn từ detector PPG và không tự tải BIDMC.
Bạn cần ghi nguồn dataset, giấy phép, cách cắt cửa sổ và cách tổng hợp nhãn
theo cùng khoảng 8 giây trong báo cáo. Một record ID chỉ thay được subject ID
khi biết chắc mỗi record tương ứng một người khác nhau.

## 4. Kiến trúc và phép toán C

```text
PPG raw [1000,1] → minmax theo window
→ Conv1D(16,k7,SAME,ReLU) → BN → MaxPool(2) [500,16]
→ Conv1D(32,k5,SAME,ReLU) → BN → MaxPool(2) [250,32]
→ Conv1D(64,k3,SAME,ReLU) → BN → MaxPool(2) [125,64]
→ LSTM32 (sequence) → LSTM16 (last state)
→ Dense32 ReLU → Dense1 linear → BPM
```

Conv ở đây là **cross-correlation** như Keras: không đảo kernel.
LSTM dùng gate `i,f,c,o`, sigmoid/tanh, reset h/c về 0 cho mỗi cửa sổ.
Dropout bỏ qua khi inference. Không clamp đầu ra; giữ kết quả mô hình để kiểm chứng.

Minmax: `(x-min)/(max-min+1e-8)`. C và Python tính bằng float64 rồi cast FP32,
đảm bảo ổn định cho dữ liệu ADC có DC lớn. Input hằng sẽ thành 0; đó là test
số học, không có nghĩa tín hiệu hằng là phép đo sinh lý hợp lệ.

### Tối ưu đã triển khai

- C11 + libm; không TensorFlow, TFLite, ONNX, CMSIS hoặc thư viện tensor bên ngoài.
- BN xuất thành `scale=gamma/sqrt(moving_var+epsilon)` và
  `shift=beta-moving_mean*scale`. Thực hiện `scale*ReLU(conv)+shift`.
  **Không gộp BN xuyên qua ReLU vào kernel Conv.** Negative gamma vẫn được xử lý đúng.
- Conv/ReLU/BN/pooling tính gộp theo từng cặp thời gian, không cấp buffer
  trung gian cho toàn bộ output Conv và BN.
- Hai buffer 8.000 floats dùng luân phiên giữa các block CNN.
- Stream output LSTM32 trực tiếp vào LSTM16; không giữ sequence `[125,32]`.
- Keras kernel layout channels-last; output channels liên tiếp để compiler vectorize.
- Không malloc/free trong `ppg_infer`; workspace do caller sở hữu, có thể tái sử dụng.
- FP32 trước; không `-ffast-math`. Tối ưu compiler `-O3`, tắt contraction trong
  bản kiểm chứng. Chưa triển khai INT8/FP16; không gọi bản FP32 là full quantization.

Mạng có **25.505 tham số Keras**. Sau rút gọn BN: **25.281 floats**, payload
**101.124 bytes (~98,75 KiB)**; binary thêm header 24 bytes = **101.148 bytes**.
Workspace cố định **69.536 bytes (~67,91 KiB)**, chưa gồm input caller, stack,
driver sensor/RTOS/Wi-Fi. Đây là kích thước cấu trúc, không phải peak RSS.

## 5. Files sau training

| File | Dùng để làm gì |
|---|---|
| `best_model.keras` | Checkpoint gốc tốt nhất theo validation MAE |
| `model_weights.bin` | Host C loader; little-endian IEEE754 FP32, version + CRC32 |
| `model_weights.h` | `static const ppg_model`, float hex literal, dùng cho firmware |
| `weights_manifest.json` | Tên/shape/offset tensor, SHA256, preprocessing |
| `split_manifest.json` + `split_indices.npz` | Chứng cứ chia dữ liệu |
| `first_test_window.csv` | Tín hiệu thô để chạy executable C |
| `test_vectors.npz` + `predictions.csv` | Toàn bộ test windows và dự đoán C/Keras |
| `numerical_report.json` | MAE so với label và sai khác C–Keras tách riêng |
| `benchmark_report.json` + `timings_ms.csv` | CPU environment, timings và kích thước cấu trúc |
| `history.json` | Training/validation curves dạng số |

Header binary: 8 bytes `PPGCv001`, uint32 window=1000, fs=125,
float count=25281, CRC32 của payload. Mọi số header little-endian.
Loader kiểm tra magic, shape, file size, CRC32, NaN/Inf. Nếu thay kiến trúc
phải cập nhật format/exporter/C engine, không dùng file weights khác shape.

## 6. Kiểm chứng và benchmark

Notebook dùng **cùng checkpoint, cùng test input**, so toàn bộ test windows
và các stress cases: zero/constant, DC lớn, biên độ nhỏ, 45/150 BPM, random.
NaN/Inf bị từ chối. Sai khác tối đa phải <=0,05 BPM trước khi benchmark.
Ngưỡng này là tiêu chí software equivalence, không phải tiêu chuẩn y tế.

Phân biệt:

- Model MAE: dự đoán mỗi engine so với nhãn BPM.
- Implementation difference: `abs(C-Keras)`; không cần ground truth.
- Subject generalization: chỉ đánh giá ở chế độ real_npz có subject split.

Benchmark: model CPU, TensorFlow intra/inter-op 1 thread, batch 1,
warm-up 20, 300 lượt đo xen kẽ thứ tự. C bao gồm minmax và Python/ctypes overhead;
Keras bao gồm NumPy minmax, tf.function dispatch và `.numpy()` synchronization.
Load model, compile và tracing không nằm trong phần đo. Đây là hiệu năng của
hai đường gọi API hoàn chỉnh trên host CPU, không phải kernel-only speedup hay MCU.

## 7. Đưa xuống firmware

Dùng `c/ppg.c`, `c/ppg.h`, file header sinh ra và tham khảo `c/embedded_example.c`.
Không cần `ppg_io.c` hoặc hệ thống file trên MCU. Header weights chỉ include
trong một translation unit để tránh nhân bản constants. Kiểm tra linker map
để xác nhận const weights nằm trong Flash và workspace nằm ở vùng RAM phù hợp.
Workspace lớn nên đặt static hoặc phân bổ một lần; không đặt trên task stack.
Mỗi luồng inference cần workspace riêng; shared weights chỉ đọc nên có thể dùng chung.

Pipeline sensor cần bổ sung: timestamp/đồng hồ sampling, buffer 8 giây,
kiểm tra tiếp xúc và chất lượng tín hiệu, đổi sampling rate đúng 125Hz nếu cần,
sau đó gọi inference. Không truyền trực tiếp một cửa sổ 1000 mẫu @100Hz vào
mô hình @125Hz; thời lượng và chu kỳ tim sẽ bị diễn giải sai. Với MAX30102,
cần xác minh sample rate thực tế sau sample averaging bằng timestamp.
Giữ gate chất lượng trước logic cảnh báo HealthyMonitor. Dataset tổng hợp không
đủ để dùng model này cho cảnh báo sức khỏe thực tế.

Các phép đo tiếp theo trên target: latency p50/p95, peak RAM/stack high-water,
Flash qua linker map, cycles, energy nếu đo được. So sánh cùng input/checkpoint,
compiler và cùng thiết bị trước khi kết luận C nhanh hoặc tiết kiệm hơn runtime khác.

## 8. Kiểm tra source

```bash
python tests/test_equivalence.py
```

Các test bao phủ full C–Keras, BN gamma âm, state reset, NaN/Inf,
weight file hỏng, header compiler và subject-disjoint split.
`development_validation.json` ghi kết quả kiểm thử phát triển trên CPU,
không chứa checkpoint huấn luyện đầy đủ. Tập nguồn này **chưa có trọng số
đã train đủ**; notebook sẽ tạo chúng sau khi chạy Kaggle.

Tài liệu chính thức:

- https://keras.io/api/layers/recurrent_layers/lstm/
- https://keras.io/api/layers/normalization_layers/batch_normalization/
