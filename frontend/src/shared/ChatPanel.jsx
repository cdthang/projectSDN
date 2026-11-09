import React, { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  fetchChatContacts,
  fetchChatConversations,
  fetchChatMessages,
  openChatConversation,
  sendChatMessage,
  socketServerUrl
} from '../services/api.js';

function ChatPanel({ user, role }) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [callState, setCallState] = useState('');
  const [connected, setConnected] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const conversationRef = useRef(null);
  const messagesEndRef = useRef(null);
  const userId = String(user?.id || user?._id || '');
  const tokenKey = role === 'ADMIN' ? 'bookswap-admin-token' : role === 'COURIER' ? 'bookswap-courier-token' : 'bookswap-token';
  const token = localStorage.getItem(tokenKey);

  const cleanupCall = useCallback((notify = false) => {
    if (notify && conversationRef.current) {
      socketRef.current?.emit('call:signal', {
        conversationId: conversationRef.current._id,
        signal: { type: 'end' }
      });
    }
    if (peerRef.current) {
      peerRef.current.ontrack = null;
      peerRef.current.onicecandidate = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingCandidatesRef.current = [];
    setCallState('');
  }, []);

  const createPeer = useCallback(async (conversationId) => {
    if (peerRef.current) return peerRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('call:signal', {
        conversationId,
        signal: { type: 'ice-candidate', candidate }
      });
    };
    peer.ontrack = (event) => {
      const audio = document.querySelector(`[data-chat-audio="${conversationId}"]`);
      if (audio) audio.srcObject = event.streams[0];
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) cleanupCall();
    };
    peerRef.current = peer;
    return peer;
  }, [cleanupCall]);

  const handleSignal = useCallback(async ({ conversationId, from, signal }) => {
    if (!conversationRef.current || conversationRef.current._id !== conversationId || from === userId) return;
    try {
      if (signal.type === 'offer') {
        const peer = await createPeer(conversationId);
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingCandidatesRef.current) await peer.addIceCandidate(candidate);
        pendingCandidatesRef.current = [];
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socketRef.current?.emit('call:signal', { conversationId, signal: { type: 'answer', description: answer } });
        setCallState('Đang gọi thoại');
      } else if (signal.type === 'answer' && peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingCandidatesRef.current) await peerRef.current.addIceCandidate(candidate);
        pendingCandidatesRef.current = [];
        setCallState('Đang gọi thoại');
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (peerRef.current?.remoteDescription) await peerRef.current.addIceCandidate(candidate);
        else pendingCandidatesRef.current.push(candidate);
      } else if (signal.type === 'end') {
        cleanupCall();
      }
    } catch (callError) {
      setError(callError.message || 'Không thể kết nối cuộc gọi thoại.');
      cleanupCall();
    }
  }, [cleanupCall, createPeer, userId]);

  useEffect(() => {
    if (!token || !userId) return undefined;
    let active = true;
    Promise.all([fetchChatContacts(), fetchChatConversations()])
      .then(([contactResult, conversationResult]) => {
        if (!active) return;
        setContacts(contactResult.data.data);
        setConversations(conversationResult.data.data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || 'Không tải được danh bạ chat.');
      });
    const socket = io(socketServerUrl, { auth: { token }, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('connect', () => {
      setConnected(true);
      setError('');
      if (conversationRef.current) socket.emit('chat:join', conversationRef.current._id);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('chat:new-message', (message) => {
      if (conversationRef.current?._id === String(message.conversation)) {
        setMessages((current) => current.some((item) => item._id === message._id) ? current : [...current, message]);
      }
      setConversations((current) => current.map((item) => (
        String(item._id) === String(message.conversation) ? { ...item, lastMessage: message } : item
      )));
    });
    socket.on('call:signal', handleSignal);
    socket.on('chat:error', (event) => setError(event.message || 'Lỗi chat.'));
    socket.on('connect_error', (connectError) => setError(connectError.message || 'Không thể kết nối chat.'));
    return () => {
      active = false;
      cleanupCall();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [cleanupCall, handleSignal, token, userId]);

  useEffect(() => {
    conversationRef.current = conversation;
    if (!conversation) {
      setMessages([]);
      return;
    }
    setError('');
    fetchChatMessages(conversation._id)
      .then(({ data }) => setMessages(data.data))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Không tải được tin nhắn.'));
    const socket = socketRef.current;
    if (socket?.connected) socket.emit('chat:join', conversation._id, (result) => {
      if (!result?.success) setError(result?.message || 'Không thể tham gia cuộc trò chuyện.');
    });
    return () => cleanupCall(true);
  }, [conversation, cleanupCall]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const selectContact = async (contact) => {
    setError('');
    try {
      const { data } = await openChatConversation(contact._id);
      setConversation(data.data);
      setShowNewChat(false);
      setConversations((current) => [data.data, ...current.filter((item) => item._id !== data.data._id)]);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể mở cuộc trò chuyện.');
    }
  };

  const handleSend = async (event) => {
    event.preventDefault();
    if (!conversation || !text.trim()) return;
    const messageText = text.trim();
    setText('');
    if (socketRef.current?.connected) {
      socketRef.current.emit('chat:send', { conversationId: conversation._id, text: messageText }, (result) => {
        if (!result?.success) {
          setText(messageText);
          setError(result?.message || 'Không thể gửi tin nhắn.');
        } else if (result.data) {
          setMessages((current) => current.some((item) => item._id === result.data._id) ? current : [...current, result.data]);
        }
      });
      return;
    }
    try {
      const { data } = await sendChatMessage(conversation._id, messageText);
      setMessages((current) => [...current, data.data]);
    } catch (requestError) {
      setText(messageText);
      setError(requestError.response?.data?.message || 'Không thể gửi tin nhắn.');
    }
  };

  const startCall = async () => {
    if (!conversation) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt không hỗ trợ gọi thoại hoặc trang chưa chạy trên HTTPS/localhost.');
      return;
    }
    try {
      const peer = await createPeer(conversation._id);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit('call:signal', { conversationId: conversation._id, signal: { type: 'offer', description: offer } });
      setCallState('Đang gọi...');
      setError('');
    } catch (callError) {
      setError(callError.message || 'Không thể bắt đầu cuộc gọi. Hãy kiểm tra quyền truy cập micro.');
      cleanupCall();
    }
  };

  if (!token || !userId) return null;
  const otherParticipants = conversation?.participants?.filter((participant) => String(participant._id) !== userId) || [];
  const otherParticipant = otherParticipants[0];
  const matchesFilter = (person) => activeFilter === 'all'
    || (activeFilter === 'users' && person?.role === 'USER')
    || (activeFilter === 'couriers' && person?.role === 'COURIER');
  const filteredConversations = conversations.filter((item) => {
    const person = item.participants?.find((participant) => String(participant._id) !== userId);
    const searchable = `${person?.name || ''} ${item.lastMessage?.text || ''}`.toLocaleLowerCase();
    return matchesFilter(person) && searchable.includes(search.trim().toLocaleLowerCase());
  });
  const filteredContacts = contacts.filter((contact) => (
    matchesFilter(contact) && `${contact.name} ${contact.email}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
  ));
  const openConversation = (item) => {
    setConversation(item);
    setShowNewChat(false);
    setError('');
  };
  const formatRelativeTime = (value) => {
    if (!value) return '';
    const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} giờ`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days} ngày` : new Date(value).toLocaleDateString('vi-VN');
  };

  return (
    <div className="chat-widget">
      {open && (
        <section className={expanded ? 'chat-panel expanded' : 'chat-panel'} aria-label="Tin nhắn BookSwap">
          <aside className={conversation ? 'chat-sidebar mobile-hidden' : 'chat-sidebar'}>
            <div className="chat-sidebar-heading">
              <h2>Đoạn chat</h2>
              <div className="chat-toolbar">
                <button type="button" aria-label="Tin nhắn mới" title="Tin nhắn mới" onClick={() => { setShowNewChat((value) => !value); setSearch(''); }}>✎</button>
                <button type="button" aria-label={expanded ? 'Thu nhỏ cửa sổ chat' : 'Mở rộng cửa sổ chat'} title={expanded ? 'Thu nhỏ' : 'Mở rộng'} onClick={() => setExpanded((value) => !value)}>{expanded ? '⊟' : '⛶'}</button>
                <button type="button" aria-label="Đóng chat" title="Đóng chat" onClick={() => setOpen(false)}>×</button>
              </div>
            </div>
            <label className="chat-search">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm trên BookSwap" aria-label="Tìm kiếm cuộc trò chuyện" />
              {search && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => setSearch('')}>×</button>}
            </label>
            <div className="chat-filters" role="tablist" aria-label="Lọc cuộc trò chuyện">
              <button type="button" role="tab" aria-selected={activeFilter === 'all'} className={activeFilter === 'all' ? 'active' : ''} onClick={() => setActiveFilter('all')}>Tất cả</button>
              {role === 'ADMIN' && <>
                <button type="button" role="tab" aria-selected={activeFilter === 'users'} className={activeFilter === 'users' ? 'active' : ''} onClick={() => setActiveFilter('users')}>Người dùng</button>
                <button type="button" role="tab" aria-selected={activeFilter === 'couriers'} className={activeFilter === 'couriers' ? 'active' : ''} onClick={() => setActiveFilter('couriers')}>Vận chuyển</button>
              </>}
            </div>
            <div className="chat-list-title">{showNewChat ? 'Người liên hệ' : 'Gần đây'}</div>
            <div className="chat-conversation-list">
              {showNewChat ? filteredContacts.map((contact) => (
                <button type="button" key={contact._id} className="chat-conversation" onClick={() => selectContact(contact)}>
                  <span className="chat-avatar">{contact.name?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                  <span className="chat-conversation-copy"><strong>{contact.name}</strong><small>{contact.role === 'COURIER' ? 'Nhân viên vận chuyển' : 'Người dùng BookSwap'}</small></span>
                </button>
              )) : filteredConversations.map((item) => {
                const person = item.participants?.find((participant) => String(participant._id) !== userId);
                const lastMessage = item.lastMessage;
                const preview = lastMessage
                  ? `${String(lastMessage.sender?._id) === userId ? 'Bạn: ' : ''}${lastMessage.text || ''}`
                  : 'Bắt đầu trò chuyện';
                return <button type="button" key={item._id} className={conversation?._id === item._id ? 'chat-conversation active' : 'chat-conversation'} onClick={() => openConversation(item)}>
                  <span className="chat-avatar">{person?.name?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                  <span className="chat-conversation-copy">
                    <strong>{person?.name || 'Cuộc trò chuyện'}</strong>
                    <small>{preview}</small>
                  </span>
                  <time>{formatRelativeTime(lastMessage?.createdAt || item.updatedAt)}</time>
                </button>;
              })}
              {((showNewChat && !filteredContacts.length) || (!showNewChat && !filteredConversations.length)) && (
                <p className="chat-list-empty">{search ? 'Không tìm thấy kết quả.' : showNewChat ? 'Không có người liên hệ.' : 'Chưa có cuộc trò chuyện nào.'}</p>
              )}
            </div>
          </aside>
          <section className={conversation ? 'chat-thread' : 'chat-thread mobile-hidden'} aria-label="Nội dung tin nhắn">
            {conversation ? (
              <>
                <header className="chat-thread-header">
                  <button type="button" className="chat-back" aria-label="Quay lại danh sách" onClick={() => setConversation(null)}>‹</button>
                  <span className="chat-avatar">{otherParticipant?.name?.charAt(0)?.toLocaleUpperCase() || '?'}</span>
                  <div className="chat-thread-person"><strong>{otherParticipant?.name || 'Trò chuyện'}</strong><small>{otherParticipant?.role === 'COURIER' ? 'Nhân viên vận chuyển' : otherParticipant?.role === 'ADMIN' ? 'Quản trị viên' : 'Người dùng BookSwap'}</small></div>
                  <div className="chat-thread-actions">
                    <button type="button" className="chat-call-button" aria-label={callState ? 'Kết thúc cuộc gọi' : 'Gọi thoại'} title={callState ? 'Kết thúc cuộc gọi' : 'Gọi thoại'} onClick={callState ? () => cleanupCall(true) : startCall} disabled={!connected}>{callState ? '✕' : '☎'}</button>
                  </div>
                </header>
                {callState && <div className="chat-call-state">{callState}</div>}
                <audio data-chat-audio={conversation._id} autoPlay />
                <div className="chat-messages" aria-live="polite">
                  {messages.map((message) => <p key={message._id} className={String(message.sender?._id) === userId ? 'chat-message mine' : 'chat-message'}>
                    <span>{message.text}</span><small>{new Date(message.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                  </p>)}
                  {!messages.length && <p className="chat-empty">Chưa có tin nhắn. Hãy chào nhau nhé!</p>}
                  <div ref={messagesEndRef} />
                </div>
                <form className="chat-compose" onSubmit={handleSend}>
                  <input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Aa" aria-label="Tin nhắn" />
                  <button className="chat-send" type="submit" aria-label="Gửi tin nhắn" title="Gửi tin nhắn" disabled={!text.trim()}>➤</button>
                </form>
                {error && <p className="chat-error" role="alert">{error}</p>}
              </>
            ) : (
              <div className="chat-thread-placeholder">
                <span className="chat-placeholder-avatar">{user?.name?.charAt(0)?.toLocaleUpperCase() || 'B'}</span>
                <strong>Chào {user?.name || 'bạn'}!</strong>
                <p>Chọn một đoạn chat để bắt đầu nhắn tin.</p>
                {error && <p className="chat-error" role="alert">{error}</p>}
              </div>
            )}
          </section>
        </section>
      )}
      <button className="chat-launcher" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {open ? 'Đóng chat' : '✉ Tin nhắn'}
      </button>
    </div>
  );
}

export default ChatPanel;
