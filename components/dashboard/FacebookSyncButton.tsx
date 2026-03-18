"use client";

import { useFacebookSync } from "@/hooks/useFacebookSync";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function FacebookSyncButton() {
  const { startSync, isSyncing, syncStatus, progress } = useFacebookSync();
  const [showToast, setShowToast] = useState(false);

  const progressPercent = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  useEffect(() => {
    if (syncStatus && !isSyncing) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus, isSyncing]);

  return (
    <div className="flex flex-col items-end gap-2 relative">
      <Button
        type="button"
        onClick={startSync}
        disabled={isSyncing}
        variant="secondary"
        className="font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[4px] disabled:translate-y-[4px] bg-[#1877F2] text-white hover:bg-[#1877F2]"
      >
        {isSyncing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : (
          "Sync from Facebook"
        )}
      </Button>

      {isSyncing && progress && (
        <div className="w-72 border-2 border-black bg-white p-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-tight truncate">
              {progress.message}
            </span>
            {progress.total > 0 && (
              <span className="text-xs font-mono font-bold ml-2 whitespace-nowrap">
                {progressPercent}%
              </span>
            )}
          </div>
          <div className="w-full h-3 bg-gray-200 border border-black overflow-hidden">
            <div
              className="h-full bg-[#1877F2] transition-all duration-300 ease-out"
              style={{ width: progress.total > 0 ? `${progressPercent}%` : '100%' }}
            />
          </div>
          {progress.total > 0 && (
            <div className="text-[10px] text-gray-500 font-mono mt-1 text-right">
              {progress.current}/{progress.total} items
            </div>
          )}
        </div>
      )}

      {showToast && syncStatus && !isSyncing && (
        <div className="absolute top-full mt-4 right-0 z-50 flex items-center gap-2 p-3 pl-4 pr-6 rounded-none border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 whitespace-nowrap">
          {syncStatus.startsWith("Success")
            ? <CheckCircle2 className="h-4 w-4 text-green-600" />
            : <XCircle className="h-4 w-4 text-red-600" />
          }
          <span className="text-sm font-bold uppercase tracking-tight">{syncStatus}</span>
        </div>
      )}
    </div>
  );
}
