"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

export async function createListing(formData: {
    title: string;
    description: string;
    price: number;
    images: string[];
    platforms: string[];
}) {
    const supabase = await createClient();

    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        throw new Error("User not authenticated");
    }

    const { data, error } = await supabase.from("listings").insert({
        title: formData.title,
        description: formData.description,
        price: formData.price,
        images: formData.images,
        platforms_status: formData.platforms.reduce(
            (acc, p) => ({ ...acc, [p]: "draft" }),
            {}
        ),
        user_id: user.id,
    }).select("id").single();

    if (error) {
        console.error("Error creating listing:", error);
        throw new Error("Failed to create listing");
    }

    // Revalidate path if needed, or just let the redirect handle it
    return { id: data.id };
}
