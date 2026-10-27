export function formatDateTime(
  timestamp?: number
): string {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(timestamp)
  ) {
    return '--';
  }

  const date =
    new Date(timestamp);

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

export function formatTime(
  timestamp?: number
): string {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(timestamp)
  ) {
    return '--:--:--';
  }

  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '--:--:--';
  }

  return date.toLocaleTimeString(
    'vi-VN',
    {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }
  );
}

export function formatDate(
  timestamp?: number
): string {
  if (
    timestamp === undefined ||
    timestamp === null ||
    !Number.isFinite(timestamp)
  ) {
    return '--/--/----';
  }

  const date =
    new Date(timestamp);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '--/--/----';
  }

  return date.toLocaleDateString(
    'vi-VN',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  );
}