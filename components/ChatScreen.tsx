"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { StylePalette } from "@/components/StylePalette";
import { ThoughtCard } from "@/components/ThoughtCard";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { markConversationRead } from "@/lib/inbox/unread";
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

function displayName(person: Pick<Person, "full_name">) {
  return person.full_name || "Community member";
}

async function selectProfiles(
  run: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>
) {
  const full = await run("id, full_name, avatar_url, bio, phone_number");
  if (!full.error) return (full.data ?? []) as Person[];
  const basic = await run("id, full_name, avatar_url, bio");
  return (basic.data ?? []) as Person[];
}

export function ChatScreen() {
  const router = useRouter();
  const [me, setMe] = useState<string | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [directory, setDirectory] = useState<Person[]>([]);
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
  const [typingName, setTypingName] = useState<string | null>(null);
  const typingChannel = useRef<RealtimeChannel | null>(null);
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

    const profiles = await selectProfiles((columns) => supabase.from("profiles").select(columns).in("id", ids));

    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
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
      setDirectory(await selectProfiles((columns) => supabase.from("profiles").select(columns).neq("id", userId).limit(200)));
    });
  }, [loadThreads]);

  useEffect(() => {
    if (!me || !getSupabaseEnv().isConfigured) return;
    const supabase = createClient();
    const channel = supabase
      .channel("public:messages")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const row = payload.new as ChatMessage;
        const inThread =
          active &&
          ((row.sender_id === me && row.receiver_id === active.id) || (row.sender_id === active.id && row.receiver_id === me));
        if (inThread) {
          setMessages((current) => {
            if (current.some((message) => message.id === row.id)) return current;
            const withoutLocal = current.filter(
              (message) => !(message.id.startsWith("local-") && message.sender_id === row.sender_id && message.content === row.content)
            );
            return [...withoutLocal, row];
          });
          if (row.sender_id !== me) markConversationRead(me, active.id).catch(() => undefined);
        }
        loadThreads(me);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, () => {
        loadThreads(me);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, loadThread, loadThreads, me]);

  useEffect(() => {
    if (!me || !active) {
      setTypingName(null);
      return;
    }
    const supabase = createClient();
    const room = `typing:${[me, active.id].sort().join(":")}`;
    const channel = supabase.channel(room, { config: { presence: { key: me } } });
    typingChannel.current = channel;
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as Record<string, Array<{ typing?: boolean; name?: string }>>;
      const typing = Object.entries(state)
        .filter(([key]) => key !== me)
        .flatMap(([, metas]) => metas)
        .find((meta) => meta.typing);
      setTypingName(typing ? typing.name || displayName(active) : null);
    });
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await channel.track({ typing: false, name: myName });
    });
    return () => {
      typingChannel.current = null;
      supabase.removeChannel(channel);
    };
  }, [active, me, myName]);

  useEffect(() => {
    const channel = typingChannel.current;
    if (!channel || !active) return;
    channel.track({ typing: draft.trim().length > 0, name: myName }).catch(() => undefined);
  }, [active, draft, myName]);

  useEffect(() => {
    const trimmed = query.trim().replace(/[%_]/g, "");
    if (!trimmed || !me) {
      setPeople([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const supabase = createClient();
      setPeople(await selectProfiles((columns) => supabase.from("profiles").select(columns).ilike("full_name", `%${trimmed}%`).neq("id", me).limit(8)));
    }, 250);

    return () => window.clearTimeout(timer);
  }, [me, query]);

  useEffect(() => {
    const withId = params.get("with");
    if (!withId || !me) return;
    let cancelled = false;
    const supabase = createClient();
    selectProfiles((columns) => supabase.from("profiles").select(columns).eq("id", withId).limit(1)).then((rows) => {
      if (!cancelled && rows[0]) {
        setActive(rows[0]);
        loadThread(me, rows[0].id);
        markConversationRead(me, rows[0].id).catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadThread, me, params]);

  const activeMessages = useMemo(() => messages, [messages]);
  const needle = query.trim().toLowerCase();
  const filteredThreads = useMemo(() => {
    if (!needle) return threads;
    return threads.filter((thread) => displayName(thread.person).toLowerCase().includes(needle));
  }, [needle, threads]);
  const memberHits = useMemo(() => {
    if (!needle) return [];
    const threadIds = new Set(filteredThreads.map((thread) => thread.person.id));
    const matches = new Map<string, Person>();
    for (const person of directory) {
      if (displayName(person).toLowerCase().includes(needle)) matches.set(person.id, person);
    }
    for (const person of people) {
      if (displayName(person).toLowerCase().includes(needle)) matches.set(person.id, person);
    }
    return Array.from(matches.values())
      .filter((person) => !threadIds.has(person.id))
      .slice(0, 12);
  }, [directory, filteredThreads, needle, people]);

  async function openPerson(person: Person) {
    setActive(person);
    setQuery("");
    setPeople([]);
    if (me) {
      await loadThread(me, person.id);
      await markConversationRead(me, person.id);
      loadThreads(me);
    }
  }

  function closeConversation() {
    setActive(null);
    setTypingName(null);
    router.replace("/chat");
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
      <section className="fobc-safe-clear flex h-[100dvh] max-h-[100dvh] flex-col overflow-x-hidden px-4 text-white">
        <div className="flex items-center gap-3">
          <button type="button" onClick={closeConversation} className="text-sm font-semibold text-[#EAB308]">
            Back
          </button>
          <Link href={`/profile/${active.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar name={name} src={active.avatar_url} />
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">{name}</h1>
              <p className="truncate text-xs text-zinc-400">{typingName ? `${typingName} is typing...` : active.bio || "Active now"}</p>
            </div>
          </Link>
        </div>
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto">
          {activeMessages.length === 0 ? <p className="text-sm text-zinc-400">Say hello and start the conversation.</p> : null}
          {activeMessages.map((message) => {
            const mine = message.sender_id === me;
            const sender = mine ? { id: me || "", full_name: myName, avatar_url: myAvatar, bio: null } : active;
            return (
              <div key={message.id} className={mine ? "flex items-end justify-end gap-2" : "flex items-end justify-start gap-2"}>
                {mine ? null : (
                  <Link href={`/profile/${sender.id}`} aria-label={displayName(sender)} className="shrink-0">
                    <Avatar name={displayName(sender)} src={sender.avatar_url} size="sm" />
                  </Link>
                )}
                <p
                  className={
                    mine
                      ? "max-w-[75%] rounded-2xl rounded-br-md bg-[#EAB308] px-3 py-2 text-sm text-black"
                      : "max-w-[75%] rounded-2xl rounded-bl-md bg-[#121212] px-3 py-2 text-sm text-white"
                  }
                >
                  {message.content}
                </p>
                {mine ? (
                  <Link href={me ? `/profile/${me}` : "/profile"} aria-label={myName} className="shrink-0">
                    <Avatar name={myName} src={myAvatar} size="sm" />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
        {typingName ? <p className="pt-2 text-xs text-zinc-400">{typingName} is typing...</p> : null}
        {notice ? <p className="mt-3 text-sm text-[#EAB308]">{notice}</p> : null}
        <form onSubmit={send} className="mt-4 flex gap-2 pb-24">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message"
            aria-label="Write a message"
            className="h-11 flex-1 rounded-full border border-white/10 bg-black px-4 text-base text-white outline-none ring-[#EAB308] focus:ring-2"
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
    <section className="overflow-x-hidden text-white">
      <div className="fobc-safe-clear px-4">
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <label className="mt-3 flex h-10 items-center gap-2 rounded-xl bg-[#121212] px-3">
          <Search className="h-4 w-4 text-zinc-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search Adelphoi"
            aria-label="Search Adelphoi"
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
                <Avatar name={note.fullName} src={note.avatarUrl} fill />
              ) : (
                note.fullName.slice(0, 1)
              )}
            </span>
            <span className="mt-1 block truncate text-[11px] text-zinc-300">{note.fullName.split(" ")[0]}</span>
          </button>
        ))}
      </div>

      {memberHits.length > 0 ? (
        <ul className="mt-3 px-4">
          <li className="pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#EAB308]">Adelphoi</li>
          {memberHits.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => openPerson(person)} className="flex w-full items-center gap-3 py-3 text-left">
                <Avatar name={displayName(person)} src={person.avatar_url} />
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
      {filteredThreads.length === 0 && memberHits.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-zinc-400">
          {needle ? "No Adelphoi match that name." : "Search for a member to start a direct message."}
        </p>
      ) : null}

      <ul>
        {filteredThreads.map((thread) => (
          <li key={thread.person.id} className="px-4">
            <div className="flex items-center gap-3 py-3">
              <button type="button" onClick={() => openPerson(thread.person)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <Avatar name={displayName(thread.person)} src={thread.person.avatar_url} />
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
