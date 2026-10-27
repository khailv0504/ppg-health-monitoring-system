import React, {
  useEffect,
  useState,
} from 'react';

import {
  Alert,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  subscribeAlerts,
} from '../services/alertService';

import {
  AlertRecord,
} from '../types';

import {
  useTheme,
} from '../theme/ThemeContext';

function normalizeTimestamp(
  value: number
): number {
  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  if (value < 10000000000) {
    return value * 1000;
  }

  return value;
}

function formatAlertTime(
  timestamp: number
): string {
  const normalized =
    normalizeTimestamp(
      timestamp
    );

  if (!normalized) {
    return '--';
  }

  const date =
    new Date(normalized);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '--';
  }

  return date.toLocaleString(
    'vi-VN',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }
  );
}

export default function AlertLog() {
  const {
    colors,
  } = useTheme();

  const [
    alerts,
    setAlerts,
  ] = useState<
    AlertRecord[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  useEffect(() => {
    const unsubscribe =
      subscribeAlerts(
        data => {
          setAlerts(data);
          setLoading(false);
        },
        error => {
          console.error(
            'Lỗi đọc nhật ký cảnh báo:',
            error
          );

          setLoading(false);

          Alert.alert(
            'Lỗi',
            'Không thể đọc nhật ký cảnh báo từ Firebase.'
          );
        }
      );

    return unsubscribe;
  }, []);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor:
            colors.card,
        },
      ]}
    >
      <View
        style={
          styles.header
        }
      >
        <View>
          <Text
            style={[
              styles.title,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Nhật ký cảnh báo
          </Text>

          <Text
            style={[
              styles.subtitle,
              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            Các lần chỉ số vượt ngưỡng
          </Text>
        </View>

        <View
          style={[
            styles.countBadge,
            {
              backgroundColor:
                colors.dangerLight,
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              {
                color:
                  colors.danger,
              },
            ]}
          >
            {alerts.length}
          </Text>
        </View>
      </View>

      {loading ? (
        <View
          style={
            styles.loading
          }
        >
          <ActivityIndicator
            size="small"
            color={
              colors.primary
            }
          />

          <Text
            style={[
              styles.loadingText,
              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            Đang đồng bộ cảnh báo...
          </Text>
        </View>
      ) : alerts.length === 0 ? (
        <View
          style={
            styles.empty
          }
        >
          <Text
            style={[
              styles.emptyIcon,
              {
                color:
                  colors.success,
              },
            ]}
          >
            ✓
          </Text>

          <Text
            style={[
              styles.emptyTitle,
              {
                color:
                  colors.text,
              },
            ]}
          >
            Chưa có cảnh báo
          </Text>

          <Text
            style={[
              styles.emptyText,
              {
                color:
                  colors.textMuted,
              },
            ]}
          >
            Chưa ghi nhận lần nào vượt ngưỡng đã cấu hình.
          </Text>
        </View>
      ) : (
        <View>
          {alerts
            .slice(0, 20)
            .map(alert => {
              const isBpm =
                alert.type ===
                'bpm';

              const alertColor =
                isBpm
                  ? colors.bpm
                  : colors.spo2;

              const alertBackground =
                isBpm
                  ? colors.bpmLight
                  : colors.spo2Light;

              return (
                <View
                  key={
                    alert.id
                  }
                  style={[
                    styles.alertItem,
                    {
                      backgroundColor:
                        colors.cardSecondary,
                      borderLeftColor:
                        alertColor,
                    },
                  ]}
                >
                  <View
                    style={
                      styles.alertTop
                    }
                  >
                    <View
                      style={[
                        styles.typeBadge,
                        {
                          backgroundColor:
                            alertBackground,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          {
                            color:
                              alertColor,
                          },
                        ]}
                      >
                        {isBpm
                          ? 'BPM'
                          : 'SpO₂'}
                      </Text>
                    </View>

                    <Text
                      style={[
                        styles.time,
                        {
                          color:
                            colors.textMuted,
                        },
                      ]}
                    >
                      {formatAlertTime(
                        alert.timestamp
                      )}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.message,
                      {
                        color:
                          colors.text,
                      },
                    ]}
                  >
                    {alert.message}
                  </Text>

                  <Text
                    style={[
                      styles.detail,
                      {
                        color:
                          colors.textSecondary,
                      },
                    ]}
                  >
                    Giá trị:{' '}
                    {isBpm
                      ? `${Math.round(
                          alert.value
                        )} BPM`
                      : `${alert.value.toFixed(
                          1
                        )}%`}
                    {'  •  '}
                    Ngưỡng:{' '}
                    {isBpm
                      ? `${alert.threshold} BPM`
                      : `${alert.threshold}%`}
                  </Text>
                </View>
              );
            })}
        </View>
      )}
    </View>
  );
}

const styles =
  StyleSheet.create({
    container: {
      borderRadius: 20,
      padding: 17,
      marginBottom: 16,

      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 1,
    },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 12,
    },

    title: {
      fontSize: 18,
      lineHeight: 23,
      fontWeight: '800',
    },

    subtitle: {
      fontSize: 12,
      lineHeight: 17,
      marginTop: 2,
    },

    countBadge: {
      minWidth: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },

    countText: {
      fontSize: 13,
      fontWeight: '800',
    },

    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
    },

    loadingText: {
      fontSize: 12,
      marginLeft: 8,
    },

    empty: {
      alignItems: 'center',
      paddingVertical: 17,
    },

    emptyIcon: {
      fontSize: 30,
      fontWeight: '800',
      marginBottom: 6,
    },

    emptyTitle: {
      fontSize: 15,
      fontWeight: '800',
    },

    emptyText: {
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 17,
      marginTop: 3,
    },

    alertItem: {
      borderLeftWidth: 4,
      borderRadius: 13,
      padding: 12,
      marginBottom: 9,
    },

    alertTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent:
        'space-between',
      marginBottom: 5,
    },

    typeBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },

    typeText: {
      fontSize: 10,
      fontWeight: '800',
    },

    time: {
      fontSize: 10,
    },

    message: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },

    detail: {
      fontSize: 11,
      lineHeight: 16,
      marginTop: 4,
    },
  });