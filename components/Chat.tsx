import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, Send, X, Users, Loader2 } from 'lucide-react';
import { db } from '../db';
import { ChatMessage, UserProfile } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ChatProps {
    currentUser: UserProfile;
}

export default function Chat({ currentUser }: ChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Load messages
    useEffect(() => {
        loadMessages();
        const interval = setInterval(loadMessages, 3000); // Refresh every 3 seconds
        return () => clearInterval(interval);
    }, []);

    // Scroll to bottom when messages change
    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Mark messages as read when chat is opened
    useEffect(() => {
        if (isOpen) {
            markAllAsRead();
        }
    }, [isOpen]);

    const loadMessages = async () => {
        const allMessages = await db.chat.orderBy('timestamp').reverse().limit(100).toArray();
        setMessages(allMessages.reverse());

        // Count unread messages
        const unread = allMessages.filter(m => !m.isRead && m.senderId !== currentUser.id).length;
        setUnreadCount(unread);
    };

    const markAllAsRead = async () => {
        const unreadMessages = messages.filter(m => !m.isRead && m.senderId !== currentUser.id);
        for (const msg of unreadMessages) {
            await db.chat.update(msg.id, { isRead: true });
        }
        setUnreadCount(0);
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim()) return;

        setIsLoading(true);
        const message: ChatMessage = {
            id: uuidv4(),
            senderId: currentUser.id,
            senderName: currentUser.name,
            message: newMessage.trim(),
            timestamp: Date.now(),
            isRead: false
        };

        await db.chat.add(message);
        setNewMessage('');
        await loadMessages();
        setIsLoading(false);
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
        }
        return date.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 glass-panel bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all duration-300"
            >
                <MessageCircle size={24} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                        {unreadCount}
                    </span>
                )}
            </button>
        );
    }

    return (
        <div className="fixed bottom-6 right-6 z-50 w-96 h-[600px] glass-panel bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Users size={20} />
                    <h3 className="font-bold text-lg">Týmový Chat</h3>
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-white/20 rounded-full transition-colors"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                    <div className="text-center text-slate-400 mt-10">
                        <MessageCircle size={48} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">Zatím žádné zprávy</p>
                        <p className="text-xs mt-1">Začněte konverzaci s týmem</p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isOwn = msg.senderId === currentUser.id;
                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                    {!isOwn && (
                                        <span className="text-xs text-slate-500 font-medium mb-1 px-2">
                                            {msg.senderName}
                                        </span>
                                    )}
                                    <div
                                        className={`rounded-2xl px-4 py-2 ${isOwn
                                                ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-sm'
                                                : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                                            }`}
                                    >
                                        <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                                    </div>
                                    <span className="text-[10px] text-slate-400 mt-1 px-2">
                                        {formatTime(msg.timestamp)}
                                    </span>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-slate-200 bg-white/50">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Napište zprávu..."
                        className="flex-1 px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={isLoading}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || isLoading}
                        className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-2 rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
