import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, X, MessageSquare, Sparkles, CheckCircle2, XCircle } from 'lucide-react';
import { Agent, AgentBlock, BlockConnection } from '../../types/agent-builder';
import { sendChatMessage, ExecutionRequest } from '../../lib/agent-builder/chat-service';
import { ExecutionResult } from '../../hooks/useBlockExecutor';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  executionResult?: ExecutionResult;
}

interface ChatSidebarProps {
  currentAgent: Agent;
  onBlocksGenerated: (blocks: AgentBlock[], connections: BlockConnection[]) => void;
  onClose: () => void;
  onExecuteAction?: (execution: ExecutionRequest) => Promise<ExecutionResult>;
}

export default function ChatSidebar({
  currentAgent,
  onBlocksGenerated,
  onClose,
  onExecuteAction,
}: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI assistant. I can help you build trading agents by creating blocks and connecting them. Try asking me to create a DCA bot, grid trading strategy, or any custom trading logic!",
      suggestions: [
        'Create a DCA bot for ETH',
        'Build a grid trading strategy',
        'Add stop loss protection',
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (messageText?: string) => {
    const textToSend = messageText || input.trim();
    if (!textToSend || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: textToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendChatMessage(
        textToSend,
        messages,
        currentAgent
      );

      let executionResult: ExecutionResult | undefined;

      // If this is an immediate execution request, execute it
      if (response.executeNow && response.execution && onExecuteAction) {
        executionResult = await onExecuteAction(response.execution);
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: executionResult 
          ? (executionResult.success 
              ? `${response.content}\n\n✅ ${executionResult.data?.message || 'Action completed successfully!'}`
              : `${response.content}\n\n❌ ${executionResult.error || 'Action failed.'}`)
          : response.content,
        suggestions: response.suggestions,
        executionResult,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If blocks were generated, add them to the canvas
      if (response.blocks && response.blocks.length > 0) {
        onBlocksGenerated(response.blocks, response.connections || []);
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSend(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-sidebar">
      {/* Header */}
      <div className="chat-sidebar-header">
        <div className="chat-sidebar-header-left">
          <div className="chat-sidebar-icon">
            <Sparkles size={18} />
          </div>
          <div className="chat-sidebar-title">
            <h3>AI Assistant</h3>
            <p>Build agents with chat</p>
          </div>
        </div>
        <button
          className="chat-sidebar-close"
          onClick={onClose}
          title="Close chat"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="chat-sidebar-messages" ref={scrollRef}>
        {messages.map((message, index) => (
          <div key={index} className="chat-message-container">
            <div className={`chat-message ${message.role}`}>
              {message.role === 'assistant' && (
                <div className="chat-message-avatar assistant">
                  <MessageSquare size={14} />
                </div>
              )}
              <div className={`chat-message-bubble ${message.role}`}>
                <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
                {/* Explorer Link */}
                {message.executionResult?.explorerUrl && (
                  <a
                    href={message.executionResult.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-explorer-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 View on Stellar Expert
                  </a>
                )}
              </div>
              {message.role === 'user' && (
                <div className="chat-message-avatar user">
                  <span>You</span>
                </div>
              )}
            </div>

            {/* Suggestions */}
            {message.role === 'assistant' && message.suggestions && (
              <div className="chat-suggestions">
                {message.suggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    className="chat-suggestion-badge"
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="chat-message assistant">
            <div className="chat-message-avatar assistant">
              <MessageSquare size={14} />
            </div>
            <div className="chat-message-bubble assistant loading">
              <Loader2 size={16} className="spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="chat-sidebar-input">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="chat-input-form"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the agent you want to build..."
            disabled={isLoading}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="chat-send-btn"
          >
            {isLoading ? (
              <Loader2 size={16} className="spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
        <p className="chat-input-hint">
          AI will generate blocks and connect them automatically
        </p>
      </div>
    </div>
  );
}
