export function getEbayAuthUrl() {
    const clientId = process.env.EBAY_APP_ID!;
    const redirectUri = process.env.EBAY_REDIRECT_URI!;
    const scopes = [
        "https://api.ebay.com/oauth/api_scope/sell.inventory",
        "https://api.ebay.com/oauth/api_scope/sell.marketing.readonly"
    ].join(" ");

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: scopes,
        // prompt: "login" // Optional: force login
    });

    return `https://auth.sandbox.ebay.com/oauth2/authorize?${params.toString()}`;
}
