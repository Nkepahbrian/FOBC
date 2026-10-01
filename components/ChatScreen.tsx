"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Phone, Search, X } from "lucide-react";
import { StylePalette } from "@/components/StylePalette";
import { ThoughtCard } from "@/components/ThoughtCard";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { loadScriptures, saveScripture, type ScriptureNote } from "@/lib/scripture/api";
import { cardStyleById } from "@/lib/styles/cards";

type Person = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  phone_number?: string | null;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
};

type Thread = {
  person: Person;
  lastMessage: string;
  lastAt: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function displayName(person: Pick<Person, "full_name">) {
  return person.full_name || "Community member";
}

export function ChatScreen() {
  const [me, setMe] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Person | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [scriptures, setScriptures] = useState<ScriptureNote[]>([]);
  const [myName, setMyName] = useState("You");
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [reader, setReader] = useState<ScriptureNote | null>(null);
  const [scriptureDraft, setScriptureDraft] = useState("");
  const [scriptureStyle, setScriptureStyle] = useState("red");
  const [sharing, setSharing] = useState(false);
  const params = useSearchParams();

  const loadThreads = useCallback(async (userId: string) => {
    if (!getSupabaseEnv().isConfigured) {
      setNotice("Supabase is not configured.");
      return;
    }

    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error || !data) {
      const missing = Boolean(error && /schema cache|does not exist|relation/i.test(error.message));
      setThreads([]);
      setNotice(missing ? null : "Messages are unavailable right now.");
      return;
    }

    const latest = new Map<string, ChatMessage>();
    for (const message of data as ChatMessage[]) {
      const otherId = message.sender_id === userId ? message.receiver_id : message.sender_id;
      if (!latest.has(otherId)) latest.set(otherId, message);
    }

    const ids = Array.from(latest.keys());
    if (ids.length === 0) {
      setThreads([]);
      setNotice(null);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, bio, phone_number")
      .in("id", ids);

    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile as Person]));
    setThreads(
      ids.map((id) => {
        const message = latest.get(id)!;
        return {
          person: byId.get(id) ?? { id, full_name: "Community member", avatar_url: null, bio: null },
          lastMessage: message.content,
          lastAt: message.created_at,
        };
      })
    );
    setNotice(null);
  }, []);

  const loadThread = useCallback(async (userId: string, personId: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, receiver_id, content, created_at")
      .or(
        `and(sender_id.eq.${userId},receiver_id.eq.${personId}),and(sender_id.eq.${personId},receiver_id.eq.${userId})`
      )
      .order("created_at", { ascending: true });

    if (error) {
      setNotice("This conversation could not be opened.");
      return;
    }

    setMessages((data ?? []) as ChatMessage[]);
  }, []);

  useEffect(() => {
    if (!getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const userId = data.user?.id ?? null;
      setMe(userId);
      if (!userId) return;
      loadThreads(userId);
      const profile = await supabase.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
      const name = profile.data?.full_name || "You";
      const avatar = profile.data?.avatar_url ?? null;
      setMyName(name);
      setMyAvatar(avatar);
      setScriptures(await loadScriptures(userId, name, avatar));
    });
  }, [loadThreads]);

  useEffect(() => {
    if (!me || !getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    const channel = supabase
      .channel("fobc-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        loadThreads(me);
        if (active) loadThread(me, active.id);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, loadThread, loadThreads, me]);

  useEffect(() => {
    const trimmed = query.trim().replace(/[%_]/g, "");
    if (!trimmed || !me) {
      setPeople([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, bio, phone_number")
        .ilike("full_name", `%${trimmed}%`)
        .neq("id", me)
        .limit(8);
      setPeople((data ?? []) as Person[]);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [me, query]);

  useEffect(() => {
    const withId = params.get("with");
    if (!withId || !me) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, bio, phone_number")
      .eq("id", withId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) {
          setActive(data as Person);
          loadThread(me, data.id);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadThread, me, params]);

  const activeMessages = useMemo(() => messages, [messages]);

  async function openPerson(person: Person) {
    setActive(person);
    setQuery("");
    setPeople([]);
    if (me) await loadThread(me, person.id);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !me || !active) return;

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      sender_id: me,
      receiver_id: active.id,
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setDraft("");
    setSending(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("messages")
      .insert({ sender_id: me, receiver_id: active.id, content: text })
      .select("id, sender_id, receiver_id, content, created_at")
      .single();

    setSending(false);
    if (error || !data) {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      const missing = Boolean(error && /schema cache|does not exist|relation/i.test(error.message));
      setNotice(missing ? "Direct messages open after supabase/phase4.sql is applied." : "The message could not be sent.");
      return;
    }

    setMessages((current) => current.map((message) => (message.id === optimistic.id ? (data as ChatMessage) : message)));
    setNotice(null);
    loadThreads(me);
  }

  if (active) {
    const name = displayName(active);
    return (
      <section className="flex min-h-[70vh] flex-col px-4 pt-4 text-white">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setActive(null)} className="text-sm font-semibold text-[#EAB308]">
            Back
          </button>
          <Avatar person={active} />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{name}</h1>
            <p className="truncate text-xs text-zinc-400">{active.bio || "Active now"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-2">
          {activeMessages.length === 0 ? <p className="text-sm text-zinc-400">Say hello and start the conversation.</p> : null}
          {activeMessages.map((message) => {
            const mine = message.sender_id === me;
            return (
              <p
                key={message.id}
                className={
                  mine
                    ? "ml-10 rounded-2xl rounded-br-md bg-[#EAB308] px-3 py-2 text-sm text-black"
                    : "mr-10 rounded-2xl rounded-bl-md bg-[#121212] px-3 py-2 text-sm text-white"
                }
              >
                {message.content}
              </p>
            );
          })}
        </div>
        {notice ? <p className="mt-3 text-sm text-[#EAB308]">{notice}</p> : null}
        <form onSubmit={send} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message"
            aria-label="Write a message"
            className="h-11 flex-1 rounded-full border border-white/10 bg-black px-4 text-sm text-white outline-none ring-[#EAB308] focus:ring-2"
          />
          <button
            type="submit"
            disabled={sending}
            className="h-11 rounded-full bg-[#EAB308] px-4 text-sm font-semibold text-black disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </section>
    );
  }

  const mineNote = scriptures.find((note) => note.userId === me) ?? null;

  async function shareScripture() {
    const text = scriptureDraft.trim();
    if (!me || text.length < 2) return;
    setSharing(true);
    const note: ScriptureNote = {
      userId: me,
      fullName: myName,
      avatarUrl: myAvatar,
      content: text,
      style: scriptureStyle,
    };
    const message = await saveScripture(note);
    setScriptures((current) => [note, ...current.filter((item) => item.userId !== me)]);
    setSharing(false);
    setComposerOpen(false);
    setNotice(message);
  }

  return (
    <section className="text-white">
      <div className="px-4 pt-4">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-[#121212] px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Find someone to message"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
          />
        </label>
      </div>

      <div className="mt-4 flex gap-4 overflow-x-auto px-4 pb-2">
        <button type="button" onClick={() => { setScriptureDraft(mineNote?.content ?? ""); setScriptureStyle(mineNote?.style ?? "red"); setComposerOpen(true); }} className="w-20 shrink-0 text-center">
          <span
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 text-2xl font-semibold text-[#EAB308]"
            style={mineNote ? { background: cardStyleById(mineNote.style).background, color: cardStyleById(mineNote.style).color, borderStyle: "solid" } : undefined}
          >
            {mineNote ? mineNote.content.slice(0, 1) : "+"}
          </span>
          <span className="mt-1 block text-[11px] leading-tight text-zinc-400">Your scripture of the week</span>
        </button>
        {scriptures.filter((note) => note.userId !== me).map((note) => (
          <button key={note.userId} type="button" onClick={() => setReader(note)} className="w-16 shrink-0 text-center">
            <span
              className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-sm font-semibold"
              style={{ background: cardStyleById(note.style).background, color: cardStyleById(note.style).color }}
            >
              {note.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={note.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                note.fullName.slice(0, 1)
              )}
            </span>
            <span className="mt-1 block truncate text-[11px] text-zinc-300">{note.fullName.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {people.length > 0 ? (
        <ul className="mt-3 px-4">
          {people.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => openPerson(person)} className="flex w-full items-center gap-3 py-3 text-left">
                <Avatar person={person} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{displayName(person)}</span>
                  <span className="block truncate text-sm text-zinc-400">{person.bio || "Start a conversation"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notice ? <p className="mx-4 mt-3 rounded-2xl bg-[#EAB308]/15 px-4 py-3 text-sm text-[#EAB308]">{notice}</p> : null}
      {threads.length === 0 && people.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-zinc-400">Search for a member to start a direct message.</p>
      ) : null}

      <ul>
        {threads.map((thread) => (
          <li key={thread.person.id} className="px-4">
            <div className="flex items-center gap-3 py-3">
              <button type="button" onClick={() => openPerson(thread.person)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar person={thread.person} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{displayName(thread.person)}</span>
                    <time className="shrink-0 text-xs text-zinc-500" dateTime={thread.lastAt}>
                      {new Date(thread.lastAt).toLocaleDateString()}
                    </time>
                  </span>
                  <span className="block truncate text-sm text-zinc-400">{thread.lastMessage}</span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Call ${displayName(thread.person)}`}
                onClick={() => {
                  if (thread.person.phone_number) {
                    window.location.href = `tel:${thread.person.phone_number}`;
                    return;
                  }
                  setNotice("No phone number is saved on this profile yet.");
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white"
              >
                <Phone className="h-5 w-5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {composerOpen ? (
        <div className="fixed inset-0 z-40 mx-auto flex w-full max-w-lg items-end bg-black/70">
          <form
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-[2rem] bg-[#121212] px-5 pb-8 pt-4 text-white"
            onSubmit={(event) => {
              event.preventDefault();
              shareScripture();
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">Your scripture of the week</h2>
              <button type="button" aria-label="Close" onClick={() => setComposerOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ThoughtCard styleId={scriptureStyle}>
              <textarea
                value={scriptureDraft}
                onChange={(event) => setScriptureDraft(event.target.value)}
                placeholder="Write this week's scripture"
                aria-label="Scripture"
                rows={4}
                maxLength={280}
                className="w-full resize-none bg-transparent text-center text-2xl font-bold leading-tight outline-none placeholder:text-current placeholder:opacity-60"
                style={{ color: cardStyleById(scriptureStyle).color }}
              />
            </ThoughtCard>
            <div className="mt-3">
              <StylePalette value={scriptureStyle} onChange={setScriptureStyle} />
            </div>
            <button type="submit" disabled={sharing} className="mt-4 h-11 w-full rounded-full bg-[#EAB308] text-sm font-semibold text-black disabled:opacity-60">
              {sharing ? "Sharing..." : "Share"}
            </button>
          </form>
        </div>
      ) : null}
      {reader ? (
        <div className="fixed inset-0 z-40 mx-auto flex w-full max-w-lg items-center bg-black/80 px-4">
          <div className="w-full">
            <div className="mb-3 flex items-center justify-between text-white">
              <p className="font-semibold">{reader.fullName}</p>
              <button type="button" aria-label="Close" onClick={() => setReader(null)} className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ThoughtCard text={reader.content} styleId={reader.style} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Avatar({ person }: { person: Person }) {
  const name = displayName(person);
  if (person.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#121212] text-sm font-semibold text-[#EAB308]">
      {initials(name) || "F"}
    </span>
  );
}
