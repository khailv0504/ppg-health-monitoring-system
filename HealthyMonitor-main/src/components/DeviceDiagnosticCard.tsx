import React, {
  useState,
} from 'react';

import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  runDeviceDiagnostic,
  DiagnosticResult,
} from '../services/deviceDiagnosticService';

import {
  useTheme,
} from '../theme/ThemeContext';

export default function DeviceDiagnosticCard() {
  const {
    colors,
  } = useTheme();

  const [
    result,
    setResult,
  ] =
    useState<
      DiagnosticResult | null
    >(null);

  const [
    checking,
    setChecking,
  ] =
    useState(false);

  const checkDevice =
    async () => {
      setChecking(true);

      try {
        const diagnostic =
          await runDeviceDiagnostic();

        setResult(
          diagnostic
        );
      } catch (error) {
        console.error(
          'Diagnostic error:',
          error
        );
      } finally {
        setChecking(false);
      }
    };

  return (
    <View
      style={[
        styles.card,
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
            Kiểm tra thiết bị
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
            Kiểm tra đường truyền và dữ liệu cảm biến
          </Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        style={[
          styles.button,
          {
            backgroundColor:
              colors.primary,
          },
        ]}
        onPress={
          checkDevice
        }
        disabled={checking}
      >
        {checking ? (
          <ActivityIndicator
            size="small"
            color="#FFFFFF"
          />
        ) : (
          <Text
            style={
              styles.buttonText
            }
          >
            Kiểm tra ngay
          </Text>
        )}
      </TouchableOpacity>

      {result ? (
        <View
          style={
            styles.resultContainer
          }
        >
          <View
            style={[
              styles.overall,
              {
                backgroundColor:
                  result.overall
                    ? colors.successLight
                    : colors.warningLight,
              },
            ]}
          >
            <Text
              style={[
                styles.overallText,
                {
                  color:
                    result.overall
                      ? colors.success
                      : colors.warning,
                },
              ]}
            >
              {result.overall
                ? 'Thiết bị hoạt động bình thường'
                : 'Cần kiểm tra lại thiết bị'}
            </Text>
          </View>

          {result.items.map(
            item => (
              <View
                key={
                  item.name
                }
                style={[
                  styles.item,
                  {
                    borderBottomColor:
                      colors.borderLight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor:
                        item.ok
                          ? colors.success
                          : colors.danger,
                    },
                  ]}
                />

                <View
                  style={
                    styles.itemText
                  }
                >
                  <Text
                    style={[
                      styles.itemName,
                      {
                        color:
                          colors.text,
                      },
                    ]}
                  >
                    {item.name}
                  </Text>

                  <Text
                    style={[
                      styles.itemDetail,
                      {
                        color:
                          colors.textMuted,
                      },
                    ]}
                  >
                    {item.detail}
                  </Text>
                </View>

                <Text
                  style={[
                    styles.statusText,
                    {
                      color:
                        item.ok
                          ? colors.success
                          : colors.danger,
                    },
                  ]}
                >
                  {item.ok
                    ? 'OK'
                    : 'LỖI'}
                </Text>
              </View>
            )
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles =
  StyleSheet.create({
    card: {
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
      marginTop: 3,
    },

    button: {
      height: 47,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },

    buttonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '800',
    },

    resultContainer: {
      marginTop: 13,
    },

    overall: {
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      marginBottom: 8,
    },

    overallText: {
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '800',
      textAlign: 'center',
    },

    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },

    statusDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
      marginRight: 9,
    },

    itemText: {
      flex: 1,
      paddingRight: 8,
    },

    itemName: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },

    itemDetail: {
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },

    statusText: {
      fontSize: 10,
      fontWeight: '800',
    },
  });