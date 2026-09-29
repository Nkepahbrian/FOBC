"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { createCommunityPost } from "@/lib/feed/api";
import { categoryLabel, createCategories, postTags, type CreateCategory } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"];

export function CreatePostModal() {
  const router = useRouter();
  const [category, setCategory] = useState<CreateCategory>("testimony");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function toggleTag(tag: string) {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (content.trim().length < 2) {
      setError("Write a few words before sharing.");
      return;
    }

    if (file && !acceptedTypes.includes(file.type)) {
      setError("Use a JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV file.");
      return;
    }

    if (file && file.size > 50 * 1024 * 1024) {
      setError("Choose a file smaller than 50 MB.");
      return;
    }

    setPending(true);
    const result = await createCommunityPost({ category, content, tags, file });
    setPending(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    router.push("/feed");
    router.refresh();
  }

  return (
    <div className="fixed inset-y-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 flex-col bg-[#0F172A]/45">
      <form onSubmit={onSubmit} className="mt-8 flex min-h-0 flex-1 flex-col rounded-t-[2rem] bg-white px-5 pb-28 pt-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">Share</p>
            <h1 className="text-2xl font-semibold text-[#0F172A]">New post</h1>
          </div>
          <button
            type="button"
            onClick={() => router.push("/feed")}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {createCategories.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={cn(
                "h-10 rounded-full text-xs font-semibold",
                category === item ? "bg-[#0F172A] text-white" : "bg-slate-100 text-slate-600"
              )}
            >
              {categoryLabel(item)}
            </button>
          ))}
        </div>

        <label className="mt-4 block flex-1">
          <span className="sr-only">Post</span>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="Share a testimony, a prayer request, or a word for the community."
            className="w-full resize-none rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 outline-none ring-[#F59E0B] focus:bg-white focus:ring-2"
          />
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium">Tags</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {postTags.map((tag) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-semibold",
                  tags.includes(tag) ? "bg-[#F59E0B] text-[#0F172A]" : "bg-slate-100 text-slate-600"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600">
          <ImagePlus className="h-5 w-5 text-[#F59E0B]" />
          <span className="min-w-0 flex-1 truncate">{file ? file.name : "Add a photo or video"}</span>
          <input
            type="file"
            accept={acceptedTypes.join(",")}
            className="sr-only"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>

        {error ? (
          <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-4 flex h-12 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Sharing..." : "Share with the community"}
        </button>
      </form>
    </div>
  );
}
