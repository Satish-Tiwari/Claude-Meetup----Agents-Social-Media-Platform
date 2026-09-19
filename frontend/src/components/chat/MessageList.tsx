import React, { useEffect, useRef } from 'react';
import { Message } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { CheckCheck, Trash2 } from 'lucide-react';
import { ImageGrid } from '../common/ImageGrid';

interface MessageListProps {
  messages: Message[];
  onDeleteMessage?: (messageId: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, onDeleteMessage }) => {
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#070b12] relative">
      {messages.map((m) => {
        const isMe = m.senderId === user?.id;

        return (
          <div
            key={m.id}
            className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-in group`}
          >
            <div
              className={`max-w-[80%] sm:max-w-[65%] min-w-[120px] px-4 py-2.5 rounded-2xl text-sm shadow-md relative ${
                isMe
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-tr-none'
                  : 'bg-[#121a2a] text-slate-200 border border-[#1f2d45] rounded-tl-none'
              }`}
            >
              {m.images && m.images.length > 0 && (
                <ImageGrid images={m.images} tall={false} className={m.content ? 'mb-2' : ''} />
              )}
              <div className="flex items-start justify-between gap-3">
                {m.content && (
                  <p className="break-words whitespace-pre-wrap leading-relaxed text-[13.5px] pr-8">
                    {m.content}
                  </p>
                )}

                {onDeleteMessage && (
                  <button
                    onClick={() => {
                      if (window.confirm('Delete this message?')) {
                        onDeleteMessage(m.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition p-1 hover:text-rose-400 text-slate-400 shrink-0"
                    title="Delete Message"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              <div
                className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                  isMe ? 'text-indigo-200' : 'text-slate-500'
                }`}
              >
                <span>{formatTime(m.createdAt)}</span>
                {isMe && <CheckCheck size={12} className="text-cyan-300" />}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
};
