import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QrCodeDisplayProps {
  value: string;
  size?: number;
  label?: string;
}

export function QrCodeDisplay({ value, size = 240, label }: QrCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!value) return;
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#111827', light: '#ffffff' }
    })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        // Ignore
      });
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="rounded-2xl bg-white p-3 inline-flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span className="text-sm text-gray-700">QR…</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-3 inline-block shadow-md border border-black/10">
      <img
        src={dataUrl}
        width={size}
        height={size}
        alt={label ?? `QR kód pro ${value}`}
        className="block rounded-lg"
      />
    </div>
  );
}
