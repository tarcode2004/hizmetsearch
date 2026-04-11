import { useParams } from "react-router-dom";
import { ChatContainer } from "@/components/chat/ChatContainer";

export function ChatPage() {
  // Capture the optional :conversationId path segment so a deep-link
  // (e.g. from the search page's "Keep chatting" button) lands on the
  // correct conversation. Without this, ChatContainer always boots in
  // "new draft" mode and ignores the URL.
  const { conversationId } = useParams<{ conversationId?: string }>();
  return <ChatContainer routeConversationId={conversationId} />;
}
