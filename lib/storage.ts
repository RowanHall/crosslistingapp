import { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "listings";

// Map common MIME types to file extensions
const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg":  "jpg",
    "image/png":  "png",
    "image/webp": "webp",
    "image/gif":  "gif",
    "image/avif": "avif",
};

/**
 * Downloads an image from `imageUrl`, uploads it to Supabase Storage, and
 * returns the permanent public URL. Returns `null` on any failure so callers
 * can skip bad images without crashing the whole upload batch.
 *
 * @param supabase  An authenticated Supabase client (server or service-role)
 * @param imageUrl  The remote URL to download from
 * @param prefix    A short label prepended to the filename, e.g. "fb" or "grailed"
 */
export async function uploadImageFromUrl(
    supabase: SupabaseClient,
    imageUrl: string,
    prefix: string
): Promise<string | null> {
    // --- 1. Download --------------------------------------------------------
    let response: Response;
    try {
        response = await fetch(imageUrl);
        if (!response.ok) {
            console.error(`[storage] Failed to download image (HTTP ${response.status}): ${imageUrl}`);
            return null;
        }
    } catch (err: any) {
        console.error(`[storage] Network error downloading image: ${imageUrl}`, err.message);
        return null;
    }

    // --- 2. Detect content type & build filename ----------------------------
    const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "image/jpeg";
    const ext = MIME_TO_EXT[contentType] ?? "jpg";
    const filename = `${prefix}-${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const storagePath = `images/${filename}`;

    // --- 3. Convert to Buffer -----------------------------------------------
    let buffer: Buffer;
    try {
        const arrayBuffer = await response.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
    } catch (err: any) {
        console.error(`[storage] Failed to read image body: ${imageUrl}`, err.message);
        return null;
    }

    // --- 4. Upload to Supabase Storage --------------------------------------
    const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, buffer, {
            contentType,
            upsert: false,
        });

    if (uploadError) {
        console.error(`[storage] Upload failed for ${storagePath}:`, uploadError.message);
        return null;
    }

    // --- 5. Return public URL -----------------------------------------------
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data.publicUrl;
}
