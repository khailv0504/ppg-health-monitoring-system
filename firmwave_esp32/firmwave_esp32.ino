#include <Wire.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// --- THÊM THƯ VIỆN WIFI VÀ FIREBASE ---
#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include "addons/TokenHelper.h"
#include "addons/RTDBHelper.h"

// --- CẤU HÌNH WIFI & FIREBASE ---
#define WIFI_SSID "•~>Minh"
#define WIFI_PASSWORD "minh170522"
#define API_KEY "AIzaSyD8WJ87ObKrBBq24nNOqgBvQ1XttvXY61E"
#define DATABASE_URL "https://max30102-bccad-default-rtdb.asia-southeast1.firebasedatabase.app/" 

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
unsigned long sendDataPrevMillis = 0;
bool signupOK = false;

//BIẾN ĐẾM THỜI GIAN LƯU LỊCH SỬ NGẦM LÊN FIREBASE>APP
unsigned long historyPrevMillis = 0;
const unsigned long historyInterval = 15000; // Lưu lịch sử mỗi 15 giây

// --- CẤU HÌNH MÀN HÌNH OLED ---
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// --- CẤU HÌNH CẢM BIẾN MAX30102 ---
MAX30105 particleSensor;

// Các biến lưu trữ dữ liệu thô
uint32_t irBuffer[100]; 
uint32_t redBuffer[100]; 
int32_t bufferLength; 
int32_t spo2; 
int8_t validSPO2; 
int32_t heartRate = 0; 
int8_t validHeartRate = 0; 

// Bộ lọc EMA
#define EMA_ALPHA 0.7
float emaIR = 0;
float emaRed = 0;
bool emaInitialized = false;

// Loại bỏ DC
#define DC_BUFFER_SIZE 50
float dcIR = 0;
float dcRed = 0;
int dcSampleCount = 0;

// Phát hiện đỉnh
float prevIR = 0;
float prevPrevIR = 0;
unsigned long lastBeatTime = 0;
#define MIN_BEAT_INTERVAL 400
#define MAX_BEAT_INTERVAL 1500
float peakThreshold = 0;
#define PEAK_THRESHOLD_ALPHA 0.95

// Bộ lọc hiển thị
#define AVG_FILTER_SIZE 5
float bpmBuffer[AVG_FILTER_SIZE];
float spo2Buffer[AVG_FILTER_SIZE];
int bpmIndex = 0;
int spo2Index = 0;
bool bpmBufferFilled = false;
bool spo2BufferFilled = false;

// Biến lưu trạng thái
String statusMsg = "Init..."; 
String hrStatus = "";

// --- CÁC HÀM XỬ LÝ TÍN HIỆU ---
float applyEMA(float newValue, float &emaValue, bool &initialized) {
  if (!initialized) {
    emaValue = newValue;
    initialized = true;
    return emaValue;
  }
  emaValue = EMA_ALPHA * newValue + (1.0 - EMA_ALPHA) * emaValue;
  return emaValue;
}

float removeDC(float emaValue, float &dcValue, int &sampleCount) {
  if (sampleCount < DC_BUFFER_SIZE) {
    dcValue = (dcValue * sampleCount + emaValue) / (sampleCount + 1);
    sampleCount++;
  } else {
    dcValue = dcValue * 0.99 + emaValue * 0.01;
  }
  return emaValue - dcValue;
}

bool detectBeat(float acSignal, float &prevSignal, float &prevPrevSignal, float &threshold) {
  float absSignal = abs(acSignal);
  threshold = PEAK_THRESHOLD_ALPHA * threshold + (1.0 - PEAK_THRESHOLD_ALPHA) * absSignal;
  
  bool isPeak = (prevSignal > acSignal) && 
                (prevSignal > prevPrevSignal) && 
                (prevSignal > threshold * 0.6) &&
                (prevSignal > 100);
  
  prevPrevSignal = prevSignal;
  prevSignal = acSignal;
  
  return isPeak;
}

float applyAverageFilter(float newValue, float buffer[], int &index, bool &filled) {
  buffer[index] = newValue;
  index++;
  if (index >= AVG_FILTER_SIZE) {
    index = 0;
    filled = true;
  }
  float sum = 0;
  int count = filled ? AVG_FILTER_SIZE : index;
  for (int i = 0; i < count; i++) {
    sum += buffer[i];
  }
  return sum / count;
}

void setup() {
  Serial.begin(115200);
  Serial.println("=================================");
  Serial.println("   ESP32 Health Monitor + WiFi");
  Serial.println("=================================");

  // 1. Khởi động OLED & Cảm biến
  Wire.begin(21, 22);
  if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { 
    Serial.println(F("SSD1306 allocation failed"));
    for(;;);
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(10, 20);
  display.print("Connecting WiFi...");
  display.display();

  // 2. Kết nối WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected! IP: ");
  Serial.println(WiFi.localIP());

  // 3. Khởi tạo Firebase
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  
  // Đăng ký ẩn danh (Anonymous Auth)
  if (Firebase.signUp(&config, &auth, "", "")) {
    Serial.println("Firebase signUp OK");
    signupOK = true;
  } else {
    Serial.printf("%s\n", config.signer.signupError.message.c_str());
  }
  
  config.token_status_callback = tokenStatusCallback;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  // 4. Khởi tạo MAX30102
  display.clearDisplay();
  display.setCursor(20, 30);
  display.print("Init Sensor...");
  display.display();

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println(F("MAX30105 was not found!"));
    while (1);
  }
  
  byte ledBrightness = 60; 
  byte sampleAverage = 4; 
  byte ledMode = 2; 
  int sampleRate = 100; 
  int pulseWidth = 411; 
  int adcRange = 4096; 
  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
  
  for (int i = 0; i < AVG_FILTER_SIZE; i++) {
    bpmBuffer[i] = 0;
    spo2Buffer[i] = 0;
  }
}

void loop() {
  bufferLength = 100;

  Serial.println("Reading initial samples...");
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(20, 30);
  display.print("Place Finger...");
  display.display();

  for (byte i = 0 ; i < bufferLength ; i++) {
    while (particleSensor.available() == false) 
      particleSensor.check();

    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();
    particleSensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer, &spo2, &validSPO2, &heartRate, &validHeartRate);

  // --- VÒNG LẶP LIÊN TỤC ---
  while (1) {
    int samplesToRead = 10; 
    
    for (byte i = samplesToRead; i < 100; i++) {
      redBuffer[i - samplesToRead] = redBuffer[i];
      irBuffer[i - samplesToRead] = irBuffer[i];
    }

    for (byte i = 100 - samplesToRead; i < 100; i++) {
      while (particleSensor.available() == false)
        particleSensor.check();

      uint32_t rawIR = particleSensor.getIR();
      uint32_t rawRed = particleSensor.getRed();
      
      redBuffer[i] = rawRed;
      irBuffer[i] = rawIR;
      particleSensor.nextSample();
      
      float filteredIR = applyEMA(rawIR, emaIR, emaInitialized);
      float filteredRed = applyEMA(rawRed, emaRed, emaInitialized);
      float acIR = removeDC(filteredIR, dcIR, dcSampleCount);
      
      if (detectBeat(acIR, prevIR, prevPrevIR, peakThreshold)) {
        unsigned long currentTime = millis();
        unsigned long interval = currentTime - lastBeatTime;
        
        if (interval > MIN_BEAT_INTERVAL && interval < MAX_BEAT_INTERVAL && lastBeatTime > 0) {
          float instantBPM = 60000.0 / interval;
          if (instantBPM >= 40 && instantBPM <= 150) {
            float avgBPM = applyAverageFilter(instantBPM, bpmBuffer, bpmIndex, bpmBufferFilled);
            heartRate = (int32_t)avgBPM;
            validHeartRate = 1;
          }
        }
        lastBeatTime = currentTime;
      }
    }

    int32_t tempSPO2, tempHR;
    int8_t tempValidSPO2, tempValidHR;
    maxim_heart_rate_and_oxygen_saturation(irBuffer, bufferLength, redBuffer, &tempSPO2, &tempValidSPO2, &tempHR, &tempValidHR);
    
    if (tempValidSPO2 == 1 && tempSPO2 > 0 && tempSPO2 <= 100) {
      spo2 = tempSPO2;
      validSPO2 = tempValidSPO2;
    }
    
    int32_t filteredSPO2 = spo2;
    if (validSPO2 == 1 && spo2 > 0 && spo2 <= 100) {
      filteredSPO2 = (int32_t)applyAverageFilter(spo2, spo2Buffer, spo2Index, spo2BufferFilled);
    }

    // --- KIỂM TRA NGÓN TAY & GỬI DỮ LIỆU ---
    FirebaseJson json; // Đối tượng JSON để đóng gói dữ liệu
    int currentDisplaySPO2 = 0;
    int currentDisplayHR = 0;
    String currentFirebaseStatus = "";

    if (irBuffer[99] < 10000) { 
       // Không có ngón tay
       emaInitialized = false; dcSampleCount = 0; bpmBufferFilled = false; spo2BufferFilled = false;
       bpmIndex = 0; spo2Index = 0; lastBeatTime = 0; peakThreshold = 0; validHeartRate = 0; validSPO2 = 0;
       
       display.clearDisplay();
       display.setTextSize(1);
       display.setCursor(15, 30);
       display.println("NO FINGER");
       display.display();

       currentFirebaseStatus = "Không có thiết bị/Ngón tay";
    } else {
       // --- XỬ LÝ HIỂN THỊ CỤC BỘ ---
       if (validSPO2 == 1 && spo2 > 0 && spo2 <= 100) {
         currentDisplaySPO2 = spo2BufferFilled ? filteredSPO2 : spo2;
         if (currentDisplaySPO2 >= 95) statusMsg = "SpO2: Good";
         else if (currentDisplaySPO2 >= 90) statusMsg = "SpO2: Low";
         else statusMsg = "SpO2: DANGER";
       } else {
         statusMsg = "SpO2: Calc...";
       }

       if (validHeartRate == 1 && heartRate > 0 && heartRate < 200) {
         currentDisplayHR = heartRate;
         if (heartRate >= 60 && heartRate <= 100) hrStatus = "HR: Normal";
         else if (heartRate >= 101 && heartRate <= 120) hrStatus = "HR: High";
         else if (heartRate > 120) hrStatus = "HR: Warn!";
         else if (heartRate >= 40 && heartRate <= 59) hrStatus = "HR: Low";
         else hrStatus = "HR: VeryLow";
       } else {
         hrStatus = "HR: Calc...";
       }

       currentFirebaseStatus = statusMsg + " | " + hrStatus;

       // Cập nhật OLED
       display.clearDisplay();
       display.drawLine(64, 0, 64, 45, SSD1306_WHITE); 
       display.drawLine(0, 45, 128, 45, SSD1306_WHITE); 

       display.setTextSize(1); display.setCursor(10, 0); display.print("BPM");
       display.setTextSize(2); display.setCursor(10, 15);
       if(currentDisplayHR > 0) display.print(currentDisplayHR); else display.print("--");

       display.setTextSize(1); display.setCursor(80, 0); display.print("SpO2");
       display.setTextSize(2); display.setCursor(80, 15);
       if(currentDisplaySPO2 > 0) display.print(currentDisplaySPO2); else display.print("--");

       display.setTextSize(1); display.setCursor(0, 52);
       if (!spo2BufferFilled || !bpmBufferFilled) display.print("Stabilizing...");
       else display.print("Status: Normal");
       display.display();
    }

    // --- ĐẨY DỮ LIỆU LÊN FIREBASE MỖI 1.5 GIÂY ---
    if (Firebase.ready() && signupOK && (millis() - sendDataPrevMillis > 1500 || sendDataPrevMillis == 0)) {
      sendDataPrevMillis = millis();
      
      json.set("bpm", currentDisplayHR);
      json.set("spo2", currentDisplaySPO2);
      json.set("status", currentFirebaseStatus);
      json.set("timestamp", (int)millis());
      
      // Đẩy JSON vào đường dẫn "health_data"
      if (Firebase.RTDB.setJSON(&fbdo, "health_data", &json)) {
        Serial.println("Firebase: Đã cập nhật dữ liệu thành công");
      } else {
        Serial.println("Firebase Error: " + fbdo.errorReason());
      }
    }
    if (Firebase.ready() && signupOK) {
      if (millis() - historyPrevMillis >= historyInterval || historyPrevMillis == 0) {
        
        historyPrevMillis = millis(); 

        // Nếu có nhịp tim hợp lệ thì mới đóng gói gửi đi
        if (currentDisplayHR > 0 && currentDisplaySPO2 > 0) {
          FirebaseJson historyJson;
          historyJson.set("bpm", currentDisplayHR);
          historyJson.set("spo2", currentDisplaySPO2);
          historyJson.set("timestamp/.sv", "timestamp"); 

          if (Firebase.RTDB.pushJSON(&fbdo, "health_history", &historyJson)) {
            Serial.println("Firebase History: Đã lưu lịch sử ngầm thành công!");
          } else {
            Serial.println("Firebase History Error: " + fbdo.errorReason());
          }
        }
      }
    }
    // ===========================================================

    delay(100); 
  }
}