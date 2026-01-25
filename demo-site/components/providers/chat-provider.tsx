'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface ChatContextType {
  isOpen: boolean;
  openChat: () => void;
  closeChat: () => void;
  toggleChat: () => void;
  setAgentBuilderMode: (enabled: boolean, config?: any) => void;
  agentBuilderMode: boolean;
  agentBuilderConfig: any;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [agentBuilderMode, setAgentBuilderModeState] = useState(false);
  const [agentBuilderConfig, setAgentBuilderConfig] = useState<any>(null);

  const openChat = useCallback(() => setIsOpen(true), []);
  const closeChat = useCallback(() => setIsOpen(false), []);
  const toggleChat = useCallback(() => setIsOpen(prev => !prev), []);
  
  const setAgentBuilderMode = useCallback((enabled: boolean, config?: any) => {
    setAgentBuilderModeState(enabled);
    setAgentBuilderConfig(config || null);
  }, []);

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        openChat,
        closeChat,
        toggleChat,
        setAgentBuilderMode,
        agentBuilderMode,
        agentBuilderConfig,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within ChatProvider');
  }
  return context;
}
