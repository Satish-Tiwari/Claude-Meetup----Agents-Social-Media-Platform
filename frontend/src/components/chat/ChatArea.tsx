import React, { useEffect, useState, useCallback } from 'react';
import { User, Message } from '../../types';
import { api } from '../../services/api';
import { useSocket } from '../../context/SocketContext';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { EmptyChatState } from './EmptyChatState';

interface ChatAreaProps {
  selectedUser: User | null;
  onBack: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ selectedUser, onBack }) => {
  const { socket } = useSocket();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const loadMessages = useCallback(async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const data = await api.getMessages(selectedUser.id);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      setLoading(false);
    }
  }, [selectedUser?.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Real-time message events from socket
  useEffect(() => {
    if (!socket || !selectedUser) return;

    const handleNewMessage = (msg: Message) => {
      if (msg.senderId === selectedUser.id || msg.receiverId === selectedUser.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    };

    const handleMessageDeleted = ({ messageId }: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    };

    const handleChatCleared = ({ otherUserId }: { otherUserId: string }) => {
      if (otherUserId === selectedUser.id) {
        setMessages([]);
      }
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message-sent', handleNewMessage);
    socket.on('message-deleted', handleMessageDeleted);
    socket.on('chat-cleared', handleChatCleared);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message-sent', handleNewMessage);
      socket.off('message-deleted', handleMessageDeleted);
      socket.off('chat-cleared', handleChatCleared);
    };
  }, [socket, selectedUser?.id]);

  const handleSendMessage = (content: string, images: string[] = []) => {
    if (!socket || !selectedUser) return;
    if (!content && images.length === 0) return;
    socket.emit('send-message', {
      toUserId: selectedUser.id,
      content,
      images,
    });
  };

  const handleDeleteMessage = async (messageId: string) => {
    try {
      await api.deleteMessage(messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      if (socket && selectedUser) {
        socket.emit('delete-message', { messageId, toUserId: selectedUser.id });
      }
    } catch (err) {
      console.error('Failed to delete message', err);
    }
  };

  const handleClearChat = async () => {
    if (!selectedUser) return;
    try {
      await api.clearChat(selectedUser.id);
      setMessages([]);
      if (socket) {
        socket.emit('clear-chat', { otherUserId: selectedUser.id });
      }
    } catch (err) {
      console.error('Failed to clear chat', err);
    }
  };

  if (!selectedUser) {
    return <EmptyChatState />;
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#111b21] overflow-hidden">
      <ChatHeader user={selectedUser} onBack={onBack} onClearChat={handleClearChat} />
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-[#8696a0] text-sm">
          Loading messages...
        </div>
      ) : (
        <MessageList messages={messages} onDeleteMessage={handleDeleteMessage} />
      )}
      <MessageInput onSendMessage={handleSendMessage} />
    </div>
  );
};
