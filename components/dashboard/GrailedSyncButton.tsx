"use client";

import { useGrailedSync } from "@/hooks/useGrailedSync";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export function GrailedSyncButton() {
  const { startSync, isSyncing, syncStatus } = useGrailedSync();
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    if (syncStatus) {
      setShowToast(true);
      const timer = setTimeout(() => setShowToast(false), 5000); // Hide after 5s
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  return (
    <div className="flex flex-col items-end gap-2 relative">
      <Button 
        type="button"
        onClick={startSync} 
        disabled={isSyncing}
        variant="secondary" 
        className="font-bold border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[4px] disabled:translate-y-[4px] bg-white text-black"
      >
        {isSyncing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Syncing...
          </>
        ) : (
          "Sync from Grailed"
        )}
      </Button>
      
      {/* Toast Notification */}
      {showToast && syncStatus && (
        <div className={`absolute top-full mt-4 right-0 z-50 flex items-center gap-2 p-3 pl-4 pr-6 rounded-none border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] animate-in fade-in slide-in-from-top-2 whitespace-nowrap`}>
            {syncStatus.startsWith("Success") ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
            <span className="text-sm font-bold uppercase tracking-tight">{syncStatus}</span>
        </div>
      )}
    </div>
  );
}
