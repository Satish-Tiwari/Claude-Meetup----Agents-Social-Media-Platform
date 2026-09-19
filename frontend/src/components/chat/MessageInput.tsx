import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { EmojiPicker } from '../common/EmojiPicker';
import { AttachmentButtons, AttachmentStrip } from '../common/AttachmentBar';
import { useAttachments } from '../common/useAttachments';

interface MessageInputProps {
  onSendMessage: (content: string, images: string[]) => void;
}

export const MessageInput: React.FC<MessageInputProps> = ({ onSendMessage }) => {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const attachments = useAttachments();

  const canSend = (text.trim().length > 0 || attachments.images.length > 0) && !attachments.uploading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;
    onSendMessage(text.trim(), attachments.images);
    setText('');
    attachments.clear();
    setEmojiOpen(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="relative bg-[#0e1626] border-t border-[#1f2d45] select-none shrink-0 px-4 pt-2 pb-3"
    >
      <AttachmentStrip images={attachments.images} onRemove={attachments.remove} error={attachments.error} />

      <div className="flex items-center gap-2.5">
        <div className="relative">
          <AttachmentButtons
            images={attachments.images}
            uploading={attachments.uploading}
            onFiles={attachments.addFiles}
            onToggleEmoji={() => setEmojiOpen((v) => !v)}
            emojiOpen={emojiOpen}
          />
          {emojiOpen && (
            <EmojiPicker
              onPick={(emoji) => setText((t) => t + emoji)}
              onClose={() => setEmojiOpen(false)}
            />
          )}
        </div>

        <div className="flex-1">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={attachments.onPaste}
            placeholder={attachments.images.length ? 'Add a caption… (optional)' : 'Type a message… paste an image to attach it'}
            className="w-full px-4 py-2.5 bg-[#0a0f18] border border-[#1f2d45] rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        <button
          type="submit"
          disabled={!canSend}
          className="p-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 hover:from-indigo-500 hover:to-cyan-400 text-white transition shadow-md shadow-indigo-600/25 disabled:opacity-40"
          title="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </form>
  );
};
