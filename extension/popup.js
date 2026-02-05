document.getElementById('fetchBtn').addEventListener('click', () => {
    console.log("Popup: Fetch button clicked");
    chrome.runtime.sendMessage({ action: "FETCH_GRAILED_DATA" }, (response) => {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error sending message:", chrome.runtime.lastError);
            return;
        }
        console.log("Popup: Response received:", response);
    });
});
