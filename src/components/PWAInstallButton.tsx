import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
      >
        <Download className="w-4 h-4" />
        Install App
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm font-bold text-indigo-700 shadow-sm hover:bg-indigo-100 active:scale-95 transition-all"
        >
          <Download className="w-4 h-4" />
          Install App
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in duration-200">
              <h3 className="text-xl font-bold text-slate-900 mb-2">Install on iPhone / iPad</h3>
              <div className="space-y-4 text-sm text-slate-600 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-white rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-900 shadow-sm text-xs">1</span>
                  <span>Tap the <strong>Share</strong> button at the bottom of Safari.</span>
                </p>
                <p className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 bg-white rounded-full border border-slate-200 flex items-center justify-center font-bold text-slate-900 shadow-sm text-xs">2</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </p>
              </div>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-900 hover:bg-slate-200 active:scale-95 transition-all"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
