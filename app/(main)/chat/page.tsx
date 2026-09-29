import { Suspense } from "react";
import { ChatScreen } from "@/components/ChatScreen";

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="px-4 pt-6 text-sm text-zinc-400">Loading messages...</p>}>
      <ChatScreen />
    </Suspense>
  );
}
