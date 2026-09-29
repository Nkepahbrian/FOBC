"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseEnv } from "@/lib/supabase/env";

type Person = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
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
      .select("id, full_name, avatar_url, bio")
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
        .select("id, full_name, avatar_url, bio")
        .ilike("full_name", `%${trimmed}%`)
        .neq("id", me)
        .limit(8);
      setPeople((data ?? []) as Person[]);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [me, query]);

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
      <section className="flex min-h-[70vh] flex-col">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setActive(null)} className="text-sm font-semibold text-[#B45309]">
            Back
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-[#0F172A]">{name}</h1>
            <p className="truncate text-sm text-slate-500">{active.bio || "Direct message"}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-1 flex-col gap-2">
          {activeMessages.length === 0 ? (
            <p className="text-sm text-slate-500">Say hello and start the conversation.</p>
          ) : null}
          {activeMessages.map((message) => {
            const mine = message.sender_id === me;
            return (
              <p
                key={message.id}
                className={
                  mine
                    ? "ml-10 rounded-2xl rounded-br-md bg-[#0F172A] px-3 py-2 text-sm text-white"
                    : "mr-10 rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-sm text-[#0F172A]"
                }
              >
                {message.content}
              </p>
            );
          })}
        </div>
        {notice ? <p className="mt-3 text-sm text-[#92400E]">{notice}</p> : null}
        <form onSubmit={send} className="mt-4 flex gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Write a message"
            aria-label="Write a message"
            className="h-11 flex-1 rounded-full border border-slate-200 px-4 text-sm outline-none ring-[#F59E0B] focus:ring-2"
          />
          <button
            type="submit"
            disabled={sending}
            className="h-11 rounded-full bg-[#F59E0B] px-4 text-sm font-semibold text-[#0F172A] disabled:opacity-60"
          >
            Send
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F59E0B]">Messages</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[#0F172A]">Chat</h1>
      </div>
      <label className="flex h-12 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find someone to message"
          aria-label="Find someone to message"
          className="h-full w-full bg-transparent text-sm outline-none"
        />
      </label>
      {people.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {people.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => openPerson(person)} className="flex w-full items-center gap-3 py-3 text-left">
                <Avatar person={person} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[#0F172A]">{displayName(person)}</span>
                  <span className="block truncate text-sm text-slate-500">{person.bio || "Start a conversation"}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="rounded-2xl bg-[#F59E0B]/15 px-4 py-3 text-sm text-[#92400E]">{notice}</p> : null}
      {threads.length === 0 && people.length === 0 ? (
        <p className="text-sm text-slate-500">Search for a member to start a direct message.</p>
      ) : null}
      <ul className="divide-y divide-slate-100">
        {threads.map((thread) => (
          <li key={thread.person.id}>
            <button type="button" onClick={() => openPerson(thread.person)} className="flex w-full items-center gap-3 py-3 text-left">
              <Avatar person={thread.person} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-[#0F172A]">{displayName(thread.person)}</span>
                  <time className="shrink-0 text-xs text-slate-400" dateTime={thread.lastAt}>
                    {new Date(thread.lastAt).toLocaleDateString()}
                  </time>
                </span>
                <span className="block truncate text-sm text-slate-500">{thread.lastMessage}</span>
              </span>
            </button>
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
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0F172A] text-sm font-semibold text-[#FBBF24]">
      {initials(name) || "F"}
    </span>
  );
}
