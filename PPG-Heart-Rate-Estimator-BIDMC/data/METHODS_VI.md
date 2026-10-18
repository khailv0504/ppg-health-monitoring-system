# Phương pháp xây dựng dữ liệu PPG tổng hợp có tham chiếu BIDMC

## 1. Nguồn tham chiếu và giới hạn
BIDMC v1.0.0 cung cấp 53 bản ghi ICU, mỗi bản ghi dài 8 phút. Dữ liệu gồm tín hiệu PLETH/PPG 125 Hz, nhịp tim HR từ ECG, PULSE từ PPG và tần số hô hấp RESP ở 1 Hz. File Fix.txt ghi nhận MIMIC II matched waveform database ID để tách các cửa sổ theo bệnh nhân. Công trình sử dụng mẫu PPG thật như nguồn hình thái, nhưng 10.000 chuỗi đầu vào cuối cùng là **tín hiệu tổng hợp**, không phải 10.000 lượt quan sát lâm sàng độc lập.

## 2. Cửa sổ và kiểm soát chất lượng
Cắt cửa sổ 8 giây, độ dài 1000 điểm ở 125 Hz, bước trượt 4 giây. Chỉ nhận cửa sổ khi đủ nhãn HR, ECG HR phù hợp khoảng thiết kế 45–150 BPM, HR biến động không quá mạnh và PULSE tương đối thống nhất với ECG HR. Loại cửa sổ có nhiều điểm NaN, tín hiệu gần hằng hoặc không xác định được hình thái nhịp. Lọc PPG bằng Butterworth bậc 3, dải 0,45–8 Hz, áp dụng sosfiltfilt để tránh trễ pha.

## 3. Trích hình thái và mô phỏng
Tìm các cực đại mạch máu; ước lượng khoảng nhịp và nhịp tim từ peak-to-peak distance. Loại mẫu nếu sự khác biệt với ECG HR quá lớn hoặc khoảng nhịp không đều. Chuẩn hóa từng chu kỳ về 128 điểm rồi lấy trung vị các chu kỳ trong cửa sổ, thu được mẫu pulse-shape tham chiếu. Để tổng hợp, biến đổi chu kỳ mạch theo HR nguồn có nhiễu biến đổi nhỏ, điều biến biên độ theo nhịp thở, chèn nhiễu Gaussian cường độ thấp hoặc motion/contact artifact.

## 4. Phân chia và chuẩn hóa
Phân nhóm theo MIMIC II patient ID **trước khi** sinh dữ liệu. Tổng số 10.000 mẫu, gồm 8.000 clean và 2.000 noisy. Train 7.200, validation 1.300, test 1.500. Chuẩn hóa min–max mỗi cửa sổ về [0,1] và giữ shape [N,1000] phù hợp upstream train.py. Dải SNR do người thiết kế chọn: 26–40 dB (clean), 2–14 dB (noisy); không được mô tả các SNR này là đo trực tiếp từ BIDMC.

## 5. Kiểm định và diễn giải
Xuất metadata (patient ID, source record, thời điểm cửa sổ nguồn, nhãn HR, artifact, SNR) và audit số cửa sổ bị loại. Chạy test offline bằng dữ liệu tạo giả để kiểm tra logic. Cần chạy bộ BIDMC thật để xác nhận nguồn hình thái được trích đủ chất lượng. Đánh giá MAE riêng trên test tổng hợp và trên **real BIDMC held-out PPG**; tuyệt đối không đánh đồng hai kết quả. Cần kiểm tra tính thống nhất tiền xử lý khi nhúng thiết bị MAX30102/ESP32.
