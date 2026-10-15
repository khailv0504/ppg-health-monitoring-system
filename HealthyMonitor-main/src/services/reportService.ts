import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { HistoryRecord } from '../types';
import { formatDateTime } from '../utils/format';


interface HealthReportStats {
  bpmAverage: number;
  bpmMin: number;
  bpmMax: number;

  spo2Average: number;
  spo2Min: number;
  spo2Max: number;
}


function escapeHtml(
  value: string
): string {

  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


function calculateStats(
  records: HistoryRecord[]
): HealthReportStats {

  if (records.length === 0) {

    return {
      bpmAverage: 0,
      bpmMin: 0,
      bpmMax: 0,

      spo2Average: 0,
      spo2Min: 0,
      spo2Max: 0,
    };
  }


  const bpmValues =
    records.map(
      item => item.bpm
    );

  const spo2Values =
    records.map(
      item => item.spo2
    );


  const bpmSum =
    bpmValues.reduce(
      (sum, value) =>
        sum + value,
      0
    );


  const spo2Sum =
    spo2Values.reduce(
      (sum, value) =>
        sum + value,
      0
    );


  return {

    bpmAverage:
      bpmSum /
      bpmValues.length,

    bpmMin:
      Math.min(
        ...bpmValues
      ),

    bpmMax:
      Math.max(
        ...bpmValues
      ),

    spo2Average:
      spo2Sum /
      spo2Values.length,

    spo2Min:
      Math.min(
        ...spo2Values
      ),

    spo2Max:
      Math.max(
        ...spo2Values
      ),

  };
}


/* =========================================================
   EXPORT PDF
========================================================= */

export async function exportHealthReportPdf(
  records: HistoryRecord[],
  periodLabel: string
): Promise<void> {

  if (
    !records ||
    records.length === 0
  ) {

    throw new Error(
      'Không có dữ liệu để tạo báo cáo.'
    );
  }


  const stats =
    calculateStats(records);


  const sortedRecords =
    [...records].sort(
      (a, b) =>
        a.timestamp -
        b.timestamp
    );


  const firstRecord =
    sortedRecords[0];

  const lastRecord =
    sortedRecords[
      sortedRecords.length - 1
    ];


  const generatedAt =
    formatDateTime(
      Date.now()
    );


  const firstTime =
    formatDateTime(
      firstRecord.timestamp
    );


  const lastTime =
    formatDateTime(
      lastRecord.timestamp
    );


  const rows =
    sortedRecords
      .map(
        (record, index) => {

          return `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(
                formatDateTime(
                  record.timestamp
                )
              )}</td>
              <td class="bpm">
                ${record.bpm.toFixed(0)}
              </td>
              <td class="spo2">
                ${record.spo2.toFixed(1)}%
              </td>
            </tr>
          `;
        }
      )
      .join('');


  const html = `
<!DOCTYPE html>

<html lang="vi">

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
/>

<title>
  Healthy Monitor Report
</title>

<style>

  * {
    box-sizing: border-box;
  }

  body {
    font-family:
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Arial,
      sans-serif;

    color: #172033;

    background: #ffffff;

    margin: 0;

    padding: 30px;
  }

  .header {
    border-bottom:
      3px solid #2563EB;

    padding-bottom: 18px;

    margin-bottom: 25px;
  }

  .title {
    font-size: 30px;

    font-weight: 800;

    color: #172033;

    margin: 0;
  }

  .subtitle {
    margin-top: 7px;

    font-size: 15px;

    color: #64748B;
  }

  .report-info {
    margin-top: 15px;

    font-size: 13px;

    color: #475569;

    line-height: 1.7;
  }

  .section-title {
    font-size: 19px;

    font-weight: 800;

    margin-top: 28px;

    margin-bottom: 13px;

    color: #172033;
  }

  .stats {
    display: grid;

    grid-template-columns:
      repeat(2, 1fr);

    gap: 12px;
  }

  .stat {
    border:
      1px solid #E2E8F0;

    border-radius: 12px;

    padding: 15px;

    background: #F8FAFC;
  }

  .stat-title {
    font-size: 12px;

    color: #64748B;

    margin-bottom: 5px;
  }

  .stat-value {
    font-size: 22px;

    font-weight: 800;

    color: #172033;
  }

  .stat-unit {
    font-size: 12px;

    color: #64748B;
  }

  .bpm-value {
    color: #2563EB;
  }

  .spo2-value {
    color: #0F766E;
  }

  table {
    width: 100%;

    border-collapse:
      collapse;

    margin-top: 10px;

    font-size: 11px;
  }

  th {
    background: #2563EB;

    color: white;

    padding: 9px 7px;

    text-align: left;
  }

  td {
    border-bottom:
      1px solid #E2E8F0;

    padding: 8px 7px;
  }

  tr:nth-child(even) {
    background: #F8FAFC;
  }

  .bpm {
    font-weight: 700;

    color: #2563EB;
  }

  .spo2 {
    font-weight: 700;

    color: #0F766E;
  }

  .footer {
    margin-top: 30px;

    padding-top: 15px;

    border-top:
      1px solid #E2E8F0;

    font-size: 11px;

    color: #94A3B8;

    text-align: center;
  }

</style>

</head>


<body>

  <div class="header">

    <h1 class="title">
      Healthy Monitor
    </h1>

    <div class="subtitle">
      Báo cáo theo dõi nhịp tim và
      nồng độ oxy trong máu
    </div>

    <div class="report-info">

      <strong>Khoảng thời gian:</strong>
      ${escapeHtml(periodLabel)}

      <br />

      <strong>Dữ liệu từ:</strong>
      ${escapeHtml(firstTime)}

      <br />

      <strong>Đến:</strong>
      ${escapeHtml(lastTime)}

      <br />

      <strong>Thời điểm tạo báo cáo:</strong>
      ${escapeHtml(generatedAt)}

      <br />

      <strong>Số bản ghi:</strong>
      ${records.length}

    </div>

  </div>


  <div class="section-title">
    Thống kê tổng quan
  </div>


  <div class="stats">

    <div class="stat">

      <div class="stat-title">
        BPM trung bình
      </div>

      <div class="stat-value bpm-value">
        ${stats.bpmAverage.toFixed(1)}
        <span class="stat-unit">
          BPM
        </span>
      </div>

    </div>


    <div class="stat">

      <div class="stat-title">
        SpO₂ trung bình
      </div>

      <div class="stat-value spo2-value">
        ${stats.spo2Average.toFixed(1)}
        <span class="stat-unit">
          %
        </span>
      </div>

    </div>


    <div class="stat">

      <div class="stat-title">
        BPM thấp nhất
      </div>

      <div class="stat-value">
        ${stats.bpmMin.toFixed(0)}
        <span class="stat-unit">
          BPM
        </span>
      </div>

    </div>


    <div class="stat">

      <div class="stat-title">
        BPM cao nhất
      </div>

      <div class="stat-value">
        ${stats.bpmMax.toFixed(0)}
        <span class="stat-unit">
          BPM
        </span>
      </div>

    </div>


    <div class="stat">

      <div class="stat-title">
        SpO₂ thấp nhất
      </div>

      <div class="stat-value">
        ${stats.spo2Min.toFixed(1)}
        <span class="stat-unit">
          %
        </span>
      </div>

    </div>


    <div class="stat">

      <div class="stat-title">
        SpO₂ cao nhất
      </div>

      <div class="stat-value">
        ${stats.spo2Max.toFixed(1)}
        <span class="stat-unit">
          %
        </span>
      </div>

    </div>

  </div>


  <div class="section-title">
    Nhật ký đo
  </div>


  <table>

    <thead>

      <tr>

        <th>
          STT
        </th>

        <th>
          Thời gian
        </th>

        <th>
          BPM
        </th>

        <th>
          SpO₂
        </th>

      </tr>

    </thead>


    <tbody>

      ${rows}

    </tbody>

  </table>


  <div class="footer">

    Healthy Monitor

    <br />

    ESP32 + MAX30102 + Firebase

  </div>

</body>

</html>
`;


  const result =
    await Print.printToFileAsync({
      html,
    });


  if (
    !result.uri
  ) {

    throw new Error(
      'Không tạo được file PDF.'
    );
  }


  const canShare =
    await Sharing.isAvailableAsync();


  if (!canShare) {

    throw new Error(
      'Thiết bị không hỗ trợ chia sẻ file.'
    );
  }


  await Sharing.shareAsync(
    result.uri,
    {
      mimeType:
        'application/pdf',

      dialogTitle:
        'Chia sẻ báo cáo sức khỏe',

      UTI:
        'com.adobe.pdf',
    }
  );
}