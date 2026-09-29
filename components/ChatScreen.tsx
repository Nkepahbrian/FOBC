"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Phone, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

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
  const [filter, setFilter] = useState<"All" | "Primary" | "General" | "Requests">("All");
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
    supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id ?? null;
      setMe(userId);
      if (userId) loadThreads(userId);
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

  const visibleThreads = threads.filter((thread) => {
    const request = /pray|request/i.test(thread.lastMessage);
    if (filter === "Requests") return request;
    if (filter === "Primary") return !request;
    if (filter === "General") return true;
    return true;
  });
  const notes = visibleThreads.slice(0, 6);

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
        <div className="w-16 shrink-0 text-center">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-white/20 bg-[#121212] text-2xl text-[#EAB308]">
            +
          </div>
          <p className="mt-1 text-[11px] text-zinc-400">Your note</p>
        </div>
        {notes.map((thread) => {
          const recent = Date.now() - new Date(thread.lastAt).getTime() < 60 * 60 * 1000;
          return (
            <button key={thread.person.id} type="button" onClick={() => openPerson(thread.person)} className="w-16 shrink-0 text-center">
              <span className="relative mx-auto block w-fit">
                <Avatar person={thread.person} />
                {recent ? <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black bg-emerald-400" /> : null}
              </span>
              <span className="mt-1 block truncate text-[11px] text-zinc-300">{displayName(thread.person).split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex gap-2 overflow-x-auto px-4">
        {(["All", "Primary", "General", "Requests"] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={filter === item}
            onClick={() => setFilter(item)}
            className={
              filter === item
                ? "h-8 rounded-full bg-white px-3 text-xs font-semibold text-black"
                : "h-8 rounded-full bg-[#121212] px-3 text-xs font-semibold text-zinc-300"
            }
          >
            {item}
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
      {visibleThreads.length === 0 && people.length === 0 ? (
        <p className="px-4 pt-6 text-sm text-zinc-400">Search for a member to start a direct message.</p>
      ) : null}

      <ul>
        {visibleThreads.map((thread) => (
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
