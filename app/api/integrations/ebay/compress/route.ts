import { deflateSync } from "zlib";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
    let aspects: unknown;

    try {
        const body = await request.json();
        aspects = body.aspects;
    } catch {
        return NextResponse.json(
            { error: "Invalid JSON body" },
            { status: 400 }
        );
    }

    if (!Array.isArray(aspects) || aspects.length === 0) {
        return NextResponse.json(
            { error: "aspects must be a non-empty array" },
            { status: 400 }
        );
    }

    let jsonString: string;
    try {
        jsonString = JSON.stringify(aspects);
    } catch (err: any) {
        console.error("[ebay/compress] Failed to serialize aspects:", err.message, aspects);
        return NextResponse.json(
            { error: "Failed to serialize aspects to JSON", detail: err.message },
            { status: 400 }
        );
    }

    let compressed: Buffer;
    try {
        // Standard zlib deflate — produces a stream with zlib headers (CMF + FLG bytes).
        // eBay's internal API expects this format, not raw deflate.
        compressed = deflateSync(jsonString);
    } catch (err: any) {
        console.error("[ebay/compress] zlib.deflateSync failed:", err.message);
        console.error("[ebay/compress] Input was:", jsonString.slice(0, 500));
        return NextResponse.json(
            { error: "Compression failed", detail: err.message },
            { status: 500 }
        );
    }

    const encodedAspects = compressed.toString("base64url");

    console.log(
        `[ebay/compress] OK — ${aspects.length} aspect(s), ` +
        `JSON ${jsonString.length} bytes → compressed ${compressed.byteLength} bytes → ` +
        `base64url ${encodedAspects.length} chars`
    );

    return NextResponse.json({ success: true, encodedAspects });
}
