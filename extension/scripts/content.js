// extension/scripts/content.js
console.log("Crosslisting App: Relay Script Loaded");

window.addEventListener("message", (event) => {
    // DEBUG: Log EVERY message this window receives to see if we catch the React one
    // (You will see many system messages here, look for yours)
    if (event.data && event.data.action) {
        console.log("Content Script saw message:", event.data);
    }

    // 1. We removed 'if (event.source !== window)' because of Isolated World conflicts

    // 2. Filter for your specific action
    if (event.data && event.data.action === "SYNC_DEPOP") {
        console.log("Content Script: Relay SYNC_DEPOP -> Background");

        chrome.runtime.sendMessage({ action: "SYNC_DEPOP" }, (response) => {
            console.log("Content Script: Response from Background:", response);
            window.postMessage({
                action: "SYNC_COMPLETE",
                payload: response
            }, "*");
        });
    }
});