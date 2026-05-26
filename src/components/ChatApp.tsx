/// <reference types="vite/client" />
import { useState, useRef, useEffect } from 'react';
import { User, signOut } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, setDoc, doc, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { chatWithGenie, chatWithGenieStream } from '../lib/gemini';
import { Logo } from './Logo';
import { loadStripe } from '@stripe/stripe-js';
import { 
  Send, LogOut, Trash2, Bot, Cpu, 
  Search, Clock, Plus, MessageSquare, Menu, X, Mic, Check,
  ChevronRight, Sparkles, Sidebar as SidebarIcon, Volume2, Pencil, Copy,
  Camera, Image as ImageIcon, FileText, Paperclip,
  MoreHorizontal, ThumbsUp, ThumbsDown, ShieldCheck,
  CreditCard, Lock as LockIcon, Unlock as UnlockIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  createdAt: any;
  attachments?: {
    type: 'image' | 'file' | 'audio';
    data: string;
    mimeType: string;
    name: string;
  }[];
  groundingSources?: {
    title: string;
    uri: string;
  }[];
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: any;
  isPrivate?: boolean;
  isLocked?: boolean;
  password?: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export default function ChatApp({ user }: { user: User }) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingResponse, setStreamingResponse] = useState<string | null>(null);
  const [streamingGroundingSources, setStreamingGroundingSources] = useState<{ title: string; uri: string }[] | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [premiumPayload, setPremiumPayload] = useState({ name: '', phone: '', transactionId: '' });
  const [longPressId, setLongPressId] = useState<string | null>(null);
  const [showSessionOptions, setShowSessionOptions] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [showPrivateMode, setShowPrivateMode] = useState(false);
  const pressTimer = useRef<NodeJS.Timeout | null>(null);
  const [attachments, setAttachments] = useState<{
    type: 'image' | 'file' | 'audio';
    data: string;
    mimeType: string;
    name: string;
  }[]>([]);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const messagePressTimer = useRef<NodeJS.Timeout | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [messageWithOptions, setMessageWithOptions] = useState<Message | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // Password lock features
  const [showLockModal, setShowLockModal] = useState<string | null>(null);
  const [lockPasswordInput, setLockPasswordInput] = useState('');
  const [showUnlockModal, setShowUnlockModal] = useState<string | null>(null);
  const [unlockPasswordInput, setUnlockPasswordInput] = useState('');
  const [unlockedSessionIds, setUnlockedSessionIds] = useState<string[]>([]);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState<string>("");
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: user?.uid,
        email: user?.email,
        emailVerified: user?.emailVerified,
        isAnonymous: user?.isAnonymous,
        tenantId: user?.tenantId,
        providerInfo: user?.providerData?.map(provider => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || []
      },
      operationType,
      path
    };
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    const rawMsg = error instanceof Error ? error.message : String(error);
    if (!rawMsg.includes("cancelled") && !rawMsg.includes("offline")) {
      setError(`Database error (${operationType} at "${path || 'unknown'}"): ${rawMsg}`);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Pre-load Web Speech API voices so they are ready instantly
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      const handleVoicesChanged = () => {
        window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
      return () => {
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      };
    }
  }, []);

  // Load chat sessions
  useEffect(() => {
    const sessionsPath = `users/${user.uid}/chats`;
    const q = query(
      collection(db, sessionsPath),
      orderBy('updatedAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatSessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
      setSessions(chatSessions);
      if (chatSessions.length > 0 && !activeSessionId) {
        setActiveSessionId(chatSessions[0].id);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, sessionsPath));
    return unsubscribe;
  }, [user.uid]);

  // Load messages for active session
  useEffect(() => {
    if (!activeSessionId) return;
    const messagesPath = `users/${user.uid}/chats/${activeSessionId}/messages`;
    const q = query(
      collection(db, messagesPath),
      orderBy('createdAt', 'asc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data({ serverTimestamps: 'estimate' }) } as Message)));
    }, (err) => handleFirestoreError(err, OperationType.GET, messagesPath));
    return unsubscribe;
  }, [user.uid, activeSessionId]);

  // Sync Premium Status
  useEffect(() => {
    const userPath = `users/${user.uid}`;
    const userDocRef = doc(db, userPath);
    const unsub = onSnapshot(userDocRef, async (snap) => {
      if (snap.exists()) {
        setIsPremium(snap.data().isPremium || false);
      } else {
        // Create user doc if not exists
        try {
          await setDoc(userDocRef, { 
            uid: user.uid,
            email: user.email,
            createdAt: serverTimestamp(),
            lastSeen: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, userPath);
        }
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, userPath));

    // Check for payment success from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const paymentSuccess = urlParams.get('payment_success');

    if (paymentSuccess === 'true' && sessionId) {
      setError("Verifying payment... Please wait.");
      verifyPayment(sessionId);
    }

    return unsub;
  }, [user.uid]);

  const verifyPayment = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/verify-payment?session_id=${sessionId}`);
      const data = await res.json();
      if (data.isPremium) {
        setIsPremium(true);
        setError("Success! Ultra Premium Unlocked.");
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } else {
        setError("Payment verification pending. It may take a minute.");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to verify payment status.");
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // 1. Instant scroll to bottom so the user doesn't see lag when switching sessions or adding a message
      el.scrollIntoView({ behavior: 'auto' });
      
      // 2. Delayed smooth scroll to capture any lazily loaded layout elements, markdown renderings, or images
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth' });
      }, 80);

      return () => clearTimeout(t);
    }
  }, [messages ? messages.length : 0, activeSessionId, streamingResponse]);

  const deleteSession = async (id: string) => {
    const sessionPath = `users/${user.uid}/chats/${id}`;
    try {
      await deleteDoc(doc(db, sessionPath));
      if (activeSessionId === id) setActiveSessionId(null);
      if (showSessionOptions === id) setShowSessionOptions(null);
      if (deletingSessionId === id) setDeletingSessionId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, sessionPath);
      setError("Failed to delete chat.");
    }
  };

  const renameSessionDirect = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) {
      return;
    }
    const sessionPath = `users/${user.uid}/chats/${id}`;
    try {
      await updateDoc(doc(db, sessionPath), {
        title: newTitle.trim(),
        updatedAt: serverTimestamp()
      });
      setRenamingSessionId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, sessionPath);
      setError("Failed to rename chat.");
    }
  };

  const handleRenameSession = async (id: string) => {
    if (!renameTitle.trim()) return;
    const sessionPath = `users/${user.uid}/chats/${id}`;
    try {
      await updateDoc(doc(db, sessionPath), {
        title: renameTitle.trim(),
        updatedAt: serverTimestamp()
      });
      setShowSessionOptions(null);
      setRenameTitle('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, sessionPath);
      setError("Failed to rename chat.");
    }
  };

  const togglePrivateSession = async (id: string, currentStatus: boolean) => {
    const sessionPath = `users/${user.uid}/chats/${id}`;
    try {
      await updateDoc(doc(db, sessionPath), {
        isPrivate: !currentStatus,
        updatedAt: serverTimestamp()
      });
      setShowSessionOptions(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, sessionPath);
      setError("Failed to update privacy status.");
    }
  };

  const handleSetPasswordLock = async (sessionId: string) => {
    if (!lockPasswordInput.trim()) return;
    const sessionPath = `users/${user.uid}/chats/${sessionId}`;
    try {
      await updateDoc(doc(db, sessionPath), {
        isLocked: true,
        password: lockPasswordInput.trim(),
        updatedAt: serverTimestamp()
      });
      setShowLockModal(null);
      setLockPasswordInput('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, sessionPath);
      setError("Failed to protect chat session.");
    }
  };

  const handleVerifyPasswordUnlock = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.password === unlockPasswordInput.trim()) {
      setUnlockedSessionIds(prev => [...prev, sessionId]);
      setActiveSessionId(sessionId);
      setShowUnlockModal(null);
      setUnlockPasswordInput('');
    } else {
      alert("Incorrect password choice! Please try again.");
    }
  };

  const handleRemovePasswordLock = async (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.password === unlockPasswordInput.trim()) {
      const sessionPath = `users/${user.uid}/chats/${sessionId}`;
      try {
        await updateDoc(doc(db, sessionPath), {
          isLocked: false,
          password: '',
          updatedAt: serverTimestamp()
        });
        setUnlockedSessionIds(prev => prev.filter(id => id !== sessionId));
        setShowUnlockModal(null);
        setUnlockPasswordInput('');
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, sessionPath);
        setError("Failed to lift session password protection.");
      }
    } else {
      alert("Incorrect password! Validation failed.");
    }
  };

  const handleSessionTouchStart = (id: string) => {
    pressTimer.current = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate(100);
      if (confirm('Are you sure you want to delete this chat history permanently?')) {
        const sessionPath = `users/${user.uid}/chats/${id}`;
        deleteDoc(doc(db, sessionPath)).catch(console.error);
        if (activeSessionId === id) setActiveSessionId(null);
      }
    }, 2000); 
  };

  const handleSessionTouchEnd = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
    }
  };

  const createNewChat = async () => {
    const sessionsPath = `users/${user.uid}/chats`;
    const newSessionRef = doc(collection(db, sessionsPath));
    const id = newSessionRef.id;
    try {
      await setDoc(newSessionRef, {
        title: 'New Chat',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
      });
      setActiveSessionId(id);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, sessionsPath);
    }
  };

  const handleMessageTouchStart = (msg: Message) => {
    if (messagePressTimer.current) clearTimeout(messagePressTimer.current);
    messagePressTimer.current = setTimeout(() => {
      if ('vibrate' in navigator) {
        try {
          navigator.vibrate(80);
        } catch (_) {}
      }
      setMessageWithOptions(msg);
    }, 2000); // Wait full 2 seconds as requested by user
  };

  const handleMessageTouchEnd = () => {
    if (messagePressTimer.current) {
      clearTimeout(messagePressTimer.current);
      messagePressTimer.current = null;
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'file' | 'audio', isCamera = false) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setPlusMenuOpen(false);
    
    const currentTotal = attachments.length + (files?.length || 0);
    if (!isPremium && currentTotal > 2) {
      setError("Free users can upload max 2 files. Upgrade to Premium for unlimted uploads!");
      setTimeout(() => setShowPremiumModal(true), 1500);
      return;
    }

    setLoading(true);

    const newAttachments: {
      type: 'image' | 'file' | 'audio';
      data: string;
      mimeType: string;
      name: string;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const isActuallyImage = file.type.startsWith('image/');
      const effectiveType = isActuallyImage ? 'image' : type;

      const limit = effectiveType === 'image' ? 20 * 1024 * 1024 : 2 * 1024 * 1024;
      
      if (file.size > limit) {
        setError(`File ${file.name} is too large. Max size is ${effectiveType === 'image' ? '20MB' : '2MB'}.`);
        continue;
      }

      if (effectiveType === 'image') {
        const objectUrl = URL.createObjectURL(file);
        try {
          const compressedBase64 = await compressImageFromUrl(objectUrl);
          newAttachments.push({
            type: 'image',
            data: compressedBase64,
            mimeType: 'image/jpeg',
            name: file.name
          });
          URL.revokeObjectURL(objectUrl);
        } catch (err) {
          console.error("Compression failed", err);
          setError(`Failed to process ${file.name}`);
          URL.revokeObjectURL(objectUrl);
        }
      } else {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const sizeInBytes = (base64.length * 3) / 4;
        if (sizeInBytes > 950 * 1024) {
          setError(`File ${file.name} is too large for the database.`);
          continue;
        }

        newAttachments.push({
          type: effectiveType as 'file' | 'audio',
          data: base64,
          mimeType: file.type,
          name: file.name
        });
      }
    }

    if (newAttachments.length > 0) {
      const updatedAttachments = [...attachments, ...newAttachments];
      setAttachments(updatedAttachments);
    }

    setLoading(false);
    e.target.value = '';
    setTimeout(() => setError(null), 5000);
  };
  
  const handlePremiumSubmit = async (e: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!premiumPayload.transactionId) {
      setError("Please enter the Transaction ID for verification");
      return;
    }
    
    setLoading(true);
    const premiumQueuePath = 'premium_requests';
    try {
      await addDoc(collection(db, premiumQueuePath), {
        userId: user.uid,
        email: user.email,
        transactionId: premiumPayload.transactionId,
        status: 'pending',
        type: 'DIRECT_UPI',
        createdAt: serverTimestamp()
      });
      setShowPremiumModal(false);
      setError("Payment notified! Our brain will verify and activate you shortly.");
      setPremiumPayload({ name: '', phone: '', transactionId: '' });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, premiumQueuePath);
      setError("Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    setLoading(true);
    try {
      const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!stripePublishableKey) {
        throw new Error("Stripe Publishable Key not configured");
      }

      const stripePromise = loadStripe(stripePublishableKey);
      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid })
      });
      
      const session = await res.json();
      if (session.error) throw new Error(session.error);

      const stripe = await stripePromise;
      if (stripe) {
        const { error } = await (stripe as any).redirectToCheckout({
          sessionId: session.id,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Payment session failed to load.");
    } finally {
      setLoading(false);
    }
  };

  const compressImageFromUrl = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = reject;
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          setAttachments(prev => [...prev, {
            type: 'audio',
            data: base64,
            mimeType: 'audio/webm',
            name: `Voice Message ${new Date().toLocaleTimeString()}`
          }]);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      setPlusMenuOpen(false);

      const timer = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      (timerRef as any).current = timer;
    } catch (err) {
      console.error(err);
      setError("Microphone access denied or not available.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current as any);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      try {
        // Temporarily clear the normal onstop callback to prevent appending attachment
        mediaRecorderRef.current.onstop = () => {
          const stream = mediaRecorderRef.current?.stream;
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
          }
        };
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping recorder package:", err);
      }
      setIsRecording(false);
      setRecordingTime(0);
      if (timerRef.current) {
        clearInterval(timerRef.current as any);
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const speak = (text: string, messageId: string | null = null) => {
    if ('speechSynthesis' in window) {
      if (messageId && speakingMessageId === messageId) {
        window.speechSynthesis.cancel();
        setSpeakingMessageId(null);
        return;
      }

      window.speechSynthesis.cancel();

      // Premium markdown pre-cleaning so the synthesizer doesn't say formatting marks out loud
      const cleanText = text
        .replace(/[*#_`~>]/g, "") // remove styling markers
        .replace(/\[.*?\]\(.*?\)/g, "") // remove links
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      const voices = window.speechSynthesis.getVoices();

      // Look for smooth, high-fidelity premium natural voices resembling standard conversational chat helpers (such as ChatGPT, Google premium, Siri or Microsoft natural)
      const preferredKeywords = [
        "google us english",
        "microsoft aria",
        "microsoft zira",
        "natural",
        "samantha",
        "siri",
        "google uk lizzie",
        "google uk",
        "female",
        "wave",
        "en-us",
        "en-gb"
      ];

      let selectedVoice = null;
      for (const keyword of preferredKeywords) {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes(keyword) && (v.lang.startsWith("en") || v.lang.startsWith("hi")));
        if (selectedVoice) break;
      }

      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith("en"));
      }
      if (!selectedVoice) {
        selectedVoice = voices.find(v => v.lang.startsWith("hi"));
      }

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      utterance.rate = 1.05; // natural talking rate
      utterance.pitch = 1.0; // standard speaking pitch

      if (messageId) {
        setSpeakingMessageId(messageId);
        utterance.onend = () => {
          setSpeakingMessageId(null);
        };
        utterance.onerror = () => {
          setSpeakingMessageId(null);
        };
      } else {
        setSpeakingMessageId("auto");
        utterance.onend = () => {
          setSpeakingMessageId(null);
        };
        utterance.onerror = () => {
          setSpeakingMessageId(null);
        };
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const resilientFetch = async (url: string, options: RequestInit, retries = 3, delay = 1000): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        return response;
      } catch (err: any) {
        const isNetworkErr = err && (err.message?.includes("Failed to fetch") || err.name === "TypeError" || err.message?.includes("fetch"));
        if (isNetworkErr && i < retries - 1) {
          console.warn(`[Client Proxy] Fetch failed, retrying in ${delay}ms... (Attempt ${i + 1}/${retries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("Failed to fetch");
  };

  const executeSendMessage = async (currentAttachments: any[]) => {
    const userInput = input.trim();

    if (!userInput && currentAttachments.length === 0) return;
    
    setLoading(true);
    let sessionId = activeSessionId;

    try {
      if (!sessionId) {
        sessionId = await createNewChat();
      }

      const hasImages = currentAttachments.some(a => a.type === 'image');
      const finalInput = userInput || (hasImages ? "Please analyze these images in detail and provide a 100% correct answer to any visible questions." : "Analyze these attachments.");
      
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      setAttachments([]);

      const msgRefPath = `users/${user.uid}/chats/${sessionId}/messages`;
      const sessionPath = `users/${user.uid}/chats/${sessionId}`;
      const msgRef = collection(db, msgRefPath);
      const sessionRef = doc(db, sessionPath);

      let history: { role: 'user' | 'model'; content: string }[] = [];

      if (editingMessageId) {
        try {
          const currentMessages = [...messages];
          const editedIndex = currentMessages.findIndex(m => m.id === editingMessageId);
          if (editedIndex !== -1) {
            const downstreamMessages = currentMessages.slice(editedIndex + 1);
            for (const dm of downstreamMessages) {
              await deleteDoc(doc(db, msgRefPath, dm.id));
            }
          }

          await updateDoc(doc(db, msgRefPath, editingMessageId), {
            text: finalInput,
            attachments: currentAttachments,
            updatedAt: serverTimestamp()
          });

          setEditingMessageId(null);

          const messagesBefore = editedIndex !== -1 ? currentMessages.slice(0, editedIndex) : [];
          history = messagesBefore.map(m => ({
            role: m.sender === 'user' ? 'user' as const : 'model' as const,
            content: m.text
          }));
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, msgRefPath);
        }
      } else {
        try {
          await addDoc(msgRef, {
            text: finalInput,
            sender: 'user',
            createdAt: serverTimestamp(),
            attachments: currentAttachments
          });

          const currentSession = sessions.find(s => s.id === sessionId);
          if (currentSession && (currentSession.title === 'New Chat' || !currentSession.title)) {
            const shortTitle = finalInput.slice(0, 40).trim() + (finalInput.length > 40 ? "..." : "");
            await setDoc(sessionRef, { 
              title: shortTitle || 'New Chat',
              updatedAt: serverTimestamp() 
            }, { merge: true });
          } else {
            await setDoc(sessionRef, { updatedAt: serverTimestamp() }, { merge: true });
          }

          history = messages.map(m => ({
            role: m.sender === 'user' ? 'user' as const : 'model' as const,
            content: m.text
          }));
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, msgRefPath);
        }
      }

      history.push({ role: 'user', content: finalInput });

      setStreamingResponse("");
      let fullResponse = "";
      
      const response = await resilientFetch("/api/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          attachments: currentAttachments.map(att => ({ mimeType: att.mimeType, data: att.data })),
          isPremium
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to communicate with secure AI server");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Stream reader not supported in your browser");

      let receivedGroundingSources: { title: string; uri: string }[] = [];

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Maintain the last incomplete line in the stream buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith("data: ")) {
            const dataStr = trimmedLine.slice(6).trim();
            if (dataStr === "[DONE]") {
              break;
            }
            let parsed: any = null;
            try {
              parsed = JSON.parse(dataStr);
            } catch (pErr) {
              // ignore partial lines or JSON parse errors
            }
            if (parsed) {
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.chunk) {
                fullResponse += parsed.chunk;
                setStreamingResponse(fullResponse);
              }
              if (parsed.groundingSources) {
                receivedGroundingSources = parsed.groundingSources;
                setStreamingGroundingSources(receivedGroundingSources);
              }
            }
          }
        }
      }

      if (autoSpeak) speak(fullResponse);

      try {
        await addDoc(msgRef, {
          text: fullResponse,
          sender: 'ai',
          createdAt: serverTimestamp(),
          groundingSources: receivedGroundingSources.length > 0 ? receivedGroundingSources : null
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, msgRefPath);
      }
    } catch (err: any) {
      console.error(err);
      let errMsg = err.message || "Something went wrong. Please try again.";
      if (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError") || err.name === "TypeError") {
        errMsg = "Our AI Server is currently initiating or completing a quick update. Please try sending your request again in a few seconds!";
      }
      setError(errMsg);
    } finally {
      setLoading(false);
      setStreamingResponse(null);
      setStreamingGroundingSources(null);
    }
  };

  const handleSend = async (e: React.FormEvent, overrideAttachments?: any[]) => {
    if (e) e.preventDefault();
    
    // If currently recording, stop it and fetch base64 to send immediately
    if (isRecording && mediaRecorderRef.current) {
      setLoading(true);
      const mediaRecorder = mediaRecorderRef.current;
      
      const getAudioAttachmentAndSend = new Promise<any>((resolve) => {
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result as string;
            const newAudioAttachment = {
              type: 'audio' as const,
              data: base64,
              mimeType: 'audio/webm',
              name: `Voice Message ${new Date().toLocaleTimeString()}`
            };
            
            const stream = mediaRecorder.stream;
            if (stream) {
              stream.getTracks().forEach(track => track.stop());
            }
            resolve(newAudioAttachment);
          };
          reader.readAsDataURL(audioBlob);
        };
      });

      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current as any);

      try {
        const voiceAttachment = await getAudioAttachmentAndSend;
        const combinedAttachments = [...attachments, voiceAttachment];
        await executeSendMessage(combinedAttachments);
      } catch (err: any) {
        console.error("Error stopping and sending voice:", err);
        setError("Could not complete the voice message transmission.");
        setLoading(false);
      }
      return;
    }

    await executeSendMessage(overrideAttachments || attachments);
  };

  return (
    <div className="h-dvh bg-slate-950 text-slate-200 font-sans flex flex-row overflow-hidden relative justify-center">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-1/2 h-full bg-indigo-500/20 blur-[150px] rounded-full"></div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside 
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col z-40 fixed lg:relative h-full shadow-2xl"
          >
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Logo className="w-6 h-6" />
                <span className="font-black tracking-tight text-white uppercase text-xs">Chat History</span>
              </div>
              <button 
                onClick={() => setSidebarOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <button 
                onClick={createNewChat}
                className="w-full h-12 flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white px-4 rounded-xl transition-all border border-slate-700 shadow-lg group active:scale-95"
              >
                <Plus className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold">New Chat</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((session) => {
                const isRenaming = renamingSessionId === session.id;
                const isDeleting = deletingSessionId === session.id;

                return (
                  <div
                    key={session.id}
                    className={cn(
                      "w-full flex items-center justify-between group p-1 pr-2 rounded-xl transition-all text-left border relative",
                      activeSessionId === session.id 
                        ? "bg-sky-500/10 border-sky-500/20 text-sky-50" 
                        : "border-transparent hover:bg-slate-800 text-slate-400"
                    )}
                  >
                    {isRenaming ? (
                      <div className="flex-1 flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-indigo-500/40">
                        <input
                          type="text"
                          value={renameInputValue}
                          onChange={(e) => setRenameInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renameSessionDirect(session.id, renameInputValue);
                            } else if (e.key === 'Escape') {
                              setRenamingSessionId(null);
                            }
                          }}
                          className="flex-1 bg-transparent border-none outline-none text-xs text-slate-200 px-1 py-0.5"
                          autoFocus
                        />
                        <button
                          onClick={() => renameSessionDirect(session.id, renameInputValue)}
                          className="p-1 text-emerald-400 hover:text-emerald-300 rounded hover:bg-slate-800 transition-colors"
                          title="Save"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setRenamingSessionId(null)}
                          className="p-1 text-rose-400 hover:text-rose-300 rounded hover:bg-slate-800 transition-colors"
                          title="Cancel"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : isDeleting ? (
                      <div className="flex-1 flex items-center justify-between gap-1.5 p-1 bg-rose-500/10 rounded-lg border border-rose-500/35">
                        <span className="text-[10px] font-black uppercase text-rose-400 px-1 py-0.5 tracking-wider">Delete Chat?</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => deleteSession(session.id)}
                            className="px-2 py-1 bg-rose-500 hover:bg-rose-600 text-white rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                          >
                            Yes
                          </button>
                          <button
                            onClick={() => setDeletingSessionId(null)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[9px] font-black uppercase tracking-wider transition-colors"
                          >
                            No
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setActiveSessionId(session.id);
                          }}
                          className="flex-1 flex items-center gap-2.5 overflow-hidden p-2 text-left"
                        >
                          <MessageSquare className={cn(
                            "w-4 h-4 flex-shrink-0",
                            activeSessionId === session.id ? "text-sky-400" : "text-slate-505"
                          )} />
                          <span className="text-sm font-semibold truncate select-none">{session.title}</span>
                        </button>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRenamingSessionId(session.id);
                              setRenameInputValue(session.title);
                            }}
                            className="p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-sky-400 transition-colors"
                            title="Rename Chat"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSessionId(session.id);
                            }}
                            className="p-1 hover:bg-rose-500/10 rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                            title="Delete Chat"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-slate-800 space-y-4">
               <div className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-2xl border border-slate-800">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-[10px] font-bold text-white uppercase tracking-tighter">
                    {user.email?.charAt(0)}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-xs font-black truncate text-white">Secure Profile</p>
                    <p className={cn(
                      "text-[10px] font-bold uppercase truncate",
                      isPremium ? "text-emerald-400" : "text-slate-500"
                    )}>{isPremium ? 'Ultra Tier' : 'Standard Tier'}</p>
                  </div>
                  <button onClick={() => signOut(auth)} className="text-slate-500 hover:text-rose-500 transition-colors p-1">
                    <LogOut className="w-4 h-4" />
                  </button>
               </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className={cn(
        "flex-1 flex flex-col relative z-10 overflow-hidden w-full h-full bg-slate-950/80 transition-all duration-300",
        sidebarOpen ? "lg:ml-0" : ""
      )}>
        {/* Header */}
        <header className="h-20 border-b border-slate-800 bg-slate-950/50 backdrop-blur-xl flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-slate-900 rounded-xl text-slate-400 transition-colors"
                title="Open History"
              >
                <SidebarIcon className="w-5 h-5" />
              </button>
            )}
            <div className="flex items-center gap-3">
              <Logo className="w-9 h-9 drop-shadow-2xl" />
              <h1 className="text-sm md:text-base font-black tracking-wider text-white uppercase italic">
                Chat <span className="text-sky-400 not-italic">with</span> AI
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:gap-6">
             {/* Beautiful Text-to-Speech Toggle Button */}
             <button
               onClick={() => {
                 const nextVal = !autoSpeak;
                 setAutoSpeak(nextVal);
                 if (!nextVal && 'speechSynthesis' in window) {
                   window.speechSynthesis.cancel();
                 }
               }}
               className={cn(
                 "flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider select-none border transition-all duration-300 shadow-md",
                 autoSpeak 
                   ? "bg-sky-500/15 border-sky-400/40 text-sky-300 hover:bg-sky-500/25 shadow-[0_0_12px_rgba(56,189,248,0.25)] animate-pulse" 
                   : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400 hover:bg-slate-800"
               )}
               title={autoSpeak ? "Turn OFF Voice Reader (Mute)" : "Turn ON Voice Reader (Speak)"}
             >
               <Volume2 className={cn("w-3.5 h-3.5", autoSpeak ? "animate-bounce text-sky-400" : "text-slate-600")} />
               <span className="hidden md:inline-block">Voice Reader</span>
               <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-950/60 font-black tracking-normal">
                 {autoSpeak ? "ON" : "OFF"}
               </span>
             </button>

             <div className="hidden lg:flex flex-col items-end">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] mb-0.5">Integration</span>
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_#10b981]"></div>
                  <span className="text-xs font-mono font-bold text-slate-400">Google Trained v3.1</span>
                </div>
             </div>
             <div className="hidden lg:block h-10 w-[1px] bg-slate-800"></div>
          </div>
        </header>

        {/* Messages */}
        <div 
          className="flex-1 overflow-y-auto px-4 md:px-8 space-y-10 scroll-smooth relative mt-4 pt-6 bg-slate-950/40"
        >
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto py-8">
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center mb-6 border border-slate-800 shadow-2xl"
              >
                <Bot className="w-10 h-10 text-indigo-500" />
              </motion.div>
              <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-3 uppercase">How can I help you today?</h2>
              <p className="text-slate-400 font-medium text-xs md:text-xs mb-8 leading-relaxed max-w-md uppercase tracking-wider px-4">
                Advanced reasoning • Secure Access
              </p>

              {/* Premium Feature Card - Outstandingly designed */}
              <div className="w-full max-w-md bg-gradient-to-br from-slate-900/60 to-slate-950/80 border border-slate-800/80 p-6 rounded-3xl backdrop-blur-md shadow-xl mb-8 text-left relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/15 transition-all duration-500 pointer-events-none"></div>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400">
                    <Volume2 className="w-4 h-4 animate-pulse" />
                  </div>
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">Voice Reader Enabled</h3>
                </div>
                
                <p className="text-[11px] text-slate-400 font-medium mb-3 leading-relaxed">
                  I will read my responses out loud automatically! You can toggle this speaking companion ON or OFF anytime using the <span className="font-bold text-sky-300">Voice Reader</span> button in the top header.
                </p>

                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span>High-Fidelity Neural TTS Active</span>
                </div>
              </div>
            </div>
          )}
          <div className="max-w-4xl mx-auto w-full space-y-8 flex flex-col">
            {/* Historical messages in standard chronological order (grows downwards) */}
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-5",
                  m.sender === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                {m.sender === 'ai' ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0 select-none">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-sky-600 to-blue-600 border border-sky-400 shadow-[0_4px_12px_rgba(14,165,233,0.3)]">
                      <Logo className="w-7 h-7" />
                    </div>
                  </div>
                ) : (
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-black bg-slate-800 border border-slate-700 select-none text-white">
                    {user.email?.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className={cn(
                  "flex flex-col gap-3 min-w-0 flex-1",
                  m.sender === 'user' ? "items-end" : "items-start"
                )}
                onMouseDown={() => handleMessageTouchStart(m)}
                onMouseUp={handleMessageTouchEnd}
                onMouseLeave={handleMessageTouchEnd}
                onTouchStart={() => handleMessageTouchStart(m)}
                onTouchEnd={handleMessageTouchEnd}
                >
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-end">
                      {m.attachments.map((att, idx) => (
                        <div key={idx} className="rounded-2xl overflow-hidden border border-slate-800 shadow-md max-w-[200px]">
                          {att.type === 'image' ? (
                            <img src={att.data} alt="Attachment" className="w-full h-auto" referrerPolicy="no-referrer" />
                          ) : att.type === 'audio' ? (
                            <div className="p-3 bg-slate-900/50 flex flex-col gap-2 min-w-[200px]">
                              <div className="flex items-center gap-2">
                                <Mic className="w-4 h-4 text-rose-500" />
                                <span className="text-[10px] font-bold text-slate-400">Voice Record</span>
                              </div>
                              <audio src={att.data} controls className="h-7 w-full filter invert hue-rotate-180 brightness-150 scale-90 origin-left" />
                            </div>
                          ) : (
                            <div className="p-3 flex items-center gap-2 bg-slate-900 text-white">
                              <FileText className="w-5 h-5 text-sky-400" />
                              <span className="text-[10px] font-bold truncate max-w-[120px]">{att.name}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] md:text-sm prose prose-sm prose-invert prose-p:leading-snug prose-headings:mb-1 prose-p:mb-0 shadow-sm relative group/msg transition-all duration-300",
                    m.sender === 'user' 
                      ? "bg-sky-600 text-white rounded-tr-none self-end ml-12" 
                      : "bg-slate-900 border border-slate-800/50 text-slate-100 rounded-tl-none self-start mr-12",
                    editingMessageId === m.id && "ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-950"
                  )}>
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                    {m.sender === 'ai' && m.groundingSources && m.groundingSources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-800/60 w-full space-y-2 select-text clear-both">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#38bdf8]">
                          <Search className="w-3.5 h-3.5 text-[#38bdf8]" />
                          <span>Live Verified Sources</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {m.groundingSources.map((src, sIdx) => {
                            const isYouTube = src.uri.includes("youtube.com") || src.uri.includes("youtu.be");
                            return (
                              <a
                                key={sIdx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-950/100 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white hover:border-indigo-500/40 transition-all shadow-sm active:scale-95 no-underline"
                                id={`source-link-${m.id}-${sIdx}`}
                              >
                                {isYouTube ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                )}
                                <span className="max-w-[150px] truncate inline-block align-middle">{src.title}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {editingMessageId === m.id && (
                      <div className="absolute -top-3 -left-3 bg-emerald-500 text-white text-[8px] font-black uppercase px-2 py-1 rounded-full shadow-lg">Editing</div>
                    )}
                    {m.sender === 'user' && (
                      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-sky-500/20 opacity-100 md:opacity-0 md:group-hover/msg:opacity-100 transition-opacity">
                        <button 
                          type="button"
                          onClick={() => {
                            setEditingMessageId(m.id);
                            setInput(m.text);
                            textareaRef.current?.focus();
                          }} 
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-950/80 hover:bg-slate-950/100 border border-slate-800 text-slate-200 hover:text-emerald-400 hover:border-emerald-500/30 transition-all text-[10px] font-bold tracking-wide"
                          title="Edit this message"
                        >
                          <Pencil className="w-3 h-3 text-emerald-400" />
                          <span>Edit Message</span>
                        </button>
                      </div>
                    )}
                     {m.sender === 'ai' && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800/40 font-bold">
                        <button 
                          type="button" 
                          onClick={() => speak(m.text, m.id)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-[11px] font-black uppercase tracking-wider select-none shadow-md cursor-pointer",
                            speakingMessageId === m.id
                              ? "bg-sky-500/15 border-sky-400/40 text-sky-400 animate-pulse shadow-[0_0_12px_rgba(56,189,248,0.2)]"
                              : "bg-slate-950 hover:bg-slate-900 border-slate-800 text-sky-400 hover:text-sky-300"
                          )}
                          title={speakingMessageId === m.id ? "Stop Reading" : "Speak Response"}
                        >
                          <Volume2 className={cn("w-3.5 h-3.5", speakingMessageId === m.id ? "animate-bounce text-sky-400" : "text-sky-400")} />
                          {speakingMessageId === m.id ? (
                            <span className="flex items-center gap-1">
                              <span>Speaking</span>
                              <span className="flex gap-[2px] items-center ml-1 h-3">
                                <span className="w-[2px] h-2 bg-sky-400 rounded-full animate-pulse"></span>
                                <span className="w-[2px] h-3.5 bg-sky-400 rounded-full animate-pulse [animation-delay:0.15s]"></span>
                                <span className="w-[2px] h-1.5 bg-sky-400 rounded-full animate-pulse [animation-delay:0.3s]"></span>
                              </span>
                            </span>
                          ) : (
                            <span>Speak Response</span>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}

            {/* If AI is streaming, render response at the very bottom */}
            {streamingResponse !== null && (
              <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-5 flex-row mb-2"
              >
                <div className="flex items-center gap-1.5 flex-shrink-0 select-none">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-sky-600 to-blue-600 border border-sky-400 shadow-[0_4px_12px_rgba(14,165,233,0.3)]">
                    <Logo className="w-7 h-7" />
                  </div>
                </div>
                <div className="flex flex-col gap-3 min-w-0 flex-1 items-start mr-12">
                  <div className="max-w-full px-4 py-2.5 rounded-2xl text-[13px] md:text-sm prose prose-sm prose-invert prose-p:leading-snug prose-headings:mb-1 prose-p:mb-0 shadow-sm bg-slate-900 border border-slate-800/50 text-slate-100 rounded-tl-none transition-all duration-300">
                    <ReactMarkdown>{streamingResponse}</ReactMarkdown>
                    {streamingResponse === "" && (
                      <div className="flex gap-1 items-center h-6">
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce"></div>
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                        <div className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                      </div>
                    )}
                    {streamingGroundingSources && streamingGroundingSources.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-slate-800/60 w-full space-y-2 select-text clear-both">
                        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#38bdf8]">
                          <Search className="w-3.5 h-3.5 text-[#38bdf8] animate-pulse" />
                          <span>Preparing Citations...</span>
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {streamingGroundingSources.map((src, sIdx) => {
                            const isYouTube = src.uri.includes("youtube.com") || src.uri.includes("youtu.be");
                            return (
                              <a
                                key={sIdx}
                                href={src.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/85 hover:bg-slate-950/100 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white hover:border-indigo-500/40 transition-all shadow-sm active:scale-95 no-underline"
                                id={`streaming-source-link-${sIdx}`}
                              >
                                {isYouTube ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                                )}
                                <span className="max-w-[150px] truncate inline-block align-middle">{src.title}</span>
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
          <div ref={scrollRef} />
        </div>

        {/* Input Bar */}
        <div className="p-6 md:p-8 bg-gradient-to-t from-slate-950 to-transparent">
          <div className="max-w-4xl mx-auto relative px-2">
            <form onSubmit={handleSend} className="relative">
              <AnimatePresence>
                {attachments.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-full left-0 right-0 mb-4 p-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800/50 rounded-3xl flex flex-wrap gap-2 shadow-2xl z-20 max-h-48 overflow-y-auto"
                  >
                    {attachments.map((att, idx) => (
                      <div key={idx} className="relative group/att">
                        <div className="w-20 h-16 bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                          {att.type === 'image' ? (
                            <img src={att.data} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : att.type === 'audio' ? (
                            <Mic className="w-6 h-6 text-rose-500" />
                          ) : (
                            <FileText className="w-6 h-6 text-indigo-400" />
                          )}
                        </div>
                        <button 
                          type="button" 
                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover/att:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {editingMessageId && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-full left-0 right-0 mb-4 p-3 bg-indigo-500/10 backdrop-blur-xl border border-indigo-500/20 rounded-2xl flex items-center justify-between shadow-2xl z-20"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-500/25 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <span className="text-[11px] font-bold text-indigo-300">
                        EditingMode: your submit will rewrite text and regenerate subsequent responses.
                      </span>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => {
                        setEditingMessageId(null);
                        setInput('');
                      }}
                      className="px-2.5 py-1 text-[9px] bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition-all font-black uppercase tracking-wider border border-white/5"
                    >
                      Cancel
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              
              <div className="group flex items-end gap-2 bg-slate-900/40 backdrop-blur-3xl border border-slate-800/50 rounded-3xl p-1.5 pl-3 focus-within:border-indigo-500/30 shadow-xl transition-all">
                {isRecording ? (
                  <div className="flex-1 flex items-center justify-between gap-3 min-h-[36px] py-1 px-1">
                    <div className="flex items-center gap-2.5 animate-pulse">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                      </span>
                      <span className="text-rose-400 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                        <Mic className="w-3.5 h-3.5 text-rose-400" />
                        Recording Voice ({formatTime(recordingTime)})
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={cancelRecording}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/25 active:scale-95 border border-rose-500/30 rounded-xl text-rose-400 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                        id="cancel-voice-recording-btn"
                        title="Cut (Discard) Voice Recording"
                      >
                        <Trash2 className="w-3 h-3 text-rose-400" />
                        <span>Cut</span>
                      </button>

                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/25 active:scale-95 border border-emerald-500/30 rounded-xl text-emerald-400 text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                        id="stop-voice-recording-btn"
                        title="Finish and Save Recording"
                      >
                        <X className="w-3 h-3 rotate-45 text-emerald-400" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 mb-0.5">
                      <div className="relative">
                        <button 
                          type="button" 
                          onClick={() => setPlusMenuOpen(!plusMenuOpen)}
                          className={cn(
                            "w-8 h-8 flex items-center justify-center rounded-full transition-all",
                            plusMenuOpen ? "bg-indigo-500 text-white rotate-45" : "bg-slate-800/50 text-slate-400 hover:text-white"
                          )}
                          title="More options"
                        >
                          <Plus className="w-4 h-4" />
                        </button>

                        <AnimatePresence>
                          {plusMenuOpen && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9, y: 10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.9, y: 10 }}
                              className="absolute bottom-full left-0 mb-4 w-56 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden z-30 p-2"
                            >
                              <button 
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                className="w-full p-4 flex items-center gap-3 hover:bg-indigo-500/10 rounded-2xl text-slate-300 transition-all group/item"
                              >
                                <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover/item:bg-indigo-500 transition-colors">
                                  <Camera className="w-5 h-5 text-indigo-400 group-hover/item:text-white" />
                                </div>
                                <span className="text-sm font-bold">Live Camera</span>
                              </button>
                              <button 
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full p-4 flex items-center gap-3 hover:bg-emerald-500/10 rounded-2xl text-slate-300 transition-all group/item"
                              >
                                <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center group-hover/item:bg-emerald-500 transition-colors">
                                  <FileText className="w-5 h-5 text-emerald-400 group-hover/item:text-white" />
                                </div>
                                <span className="text-sm font-bold">Read Files</span>
                              </button>

                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <button 
                        type="button" 
                        onClick={() => isRecording ? stopRecording() : startRecording()}
                        className={cn(
                          "w-8 h-8 flex items-center justify-center rounded-full transition-all",
                          isRecording ? "bg-rose-500 text-white animate-pulse" : "bg-slate-800/50 text-slate-400 hover:text-white"
                        )}
                        title={isRecording ? "Stop Recording" : "Voice Search"}
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 px-1.5 py-1.5 bg-slate-800/30 rounded-full border border-slate-700/30 mb-0.5 ml-1">
                      <div className="p-1 text-slate-400">
                        <Search className="w-3.5 h-3.5" />
                      </div>
                    </div>

                    <textarea 
                      ref={textareaRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Chat AI..."
                      rows={1}
                      className="bg-transparent flex-1 outline-none text-sm text-slate-200 placeholder:text-slate-600 font-medium py-2 px-1 resize-none max-h-[180px] custom-scrollbar leading-tight"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                    />
                  </>
                )}
                
                <button 
                  type="submit"
                  disabled={loading || (!input.trim() && attachments.length === 0 && !isRecording)}
                  className="w-8 h-8 bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:opacity-40 rounded-full flex items-center justify-center transition-all shadow-lg shrink-0 mb-0.5 mr-0.5 text-white"
                  title="Send Message"
                >
                  <Send className={cn("w-4 h-4 text-white", loading && "animate-pulse")} />
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
      {/* Hidden Inputs */}
      <input type="file" multiple ref={fileInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'file')} />
      <input type="file" multiple accept="image/*" ref={photoInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
      <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} className="hidden" onChange={(e) => handleFileSelect(e, 'image', true)} />

      {/* Premium Upgrade Modal */}
      <AnimatePresence>
        {showPremiumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-lg shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              <div className="p-8 pb-0 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black text-white tracking-tight uppercase">Ultra Premium</h2>
                  <p className="text-indigo-400 font-bold uppercase text-xs tracking-widest mt-1">Unlock Advanced Intelligence</p>
                </div>
                <button 
                  onClick={() => setShowPremiumModal(false)}
                  className="p-2 hover:bg-slate-800 rounded-2xl text-slate-500 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="space-y-4">
                  {[
                    "Unlimited High-Res Vision Analysis",
                    "Deep logical analysis (Advanced Brain Engine V3)",
                    "Real-time Google Search integration",
                    "No message limits or wait times",
                    "Priority Access to Multi-modal Reasoning"
                  ].map((feat, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Sparkles className="w-3 h-3 text-emerald-400" />
                      </div>
                      <span className="text-sm font-bold text-slate-300">{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Direct Payment Section Removed for Privacy */}
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 text-center space-y-4">
                  <div className="flex justify-center">
                    <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-emerald-400" />
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-white uppercase tracking-tight">Ultra Launch Offer</h4>
                    <p className="text-slate-400 text-sm font-medium mt-1">Get 1 month of Ultra AI for only ₹1</p>
                  </div>
                  <button 
                    onClick={handleStripeCheckout}
                    disabled={loading}
                    className="w-full h-16 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-sm transition-all active:scale-95 disabled:opacity-50 shadow-[0_20px_40px_rgba(16,185,129,0.3)] flex items-center justify-center gap-3"
                  >
                    <CreditCard className="w-6 h-6" />
                    {loading ? "Connecting..." : "Subscribe Now - ₹1"}
                  </button>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Secure Payment • Auto-Activation</p>
                </div>

                <div className="pt-4 flex justify-center">
                  <button onClick={() => setShowPremiumModal(false)} className="text-[10px] font-black text-slate-600 uppercase hover:text-slate-400 tracking-widest flex items-center gap-2">
                    <X className="w-3 h-3" /> Close
                  </button>
                </div>

                {isPremium && (
                  <div className="pt-6 mt-6 border-t border-slate-800">
                    <div className="bg-slate-950/50 p-4 rounded-3xl border border-indigo-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Cpu className="w-4 h-4 text-indigo-400" />
                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Brain API Access (V3)</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-900 px-4 py-3 rounded-xl border border-slate-800">
                        <code className="text-[10px] font-mono text-indigo-300">sk_brain_live_********************</code>
                        <button className="text-[10px] font-black text-indigo-500 uppercase hover:text-indigo-400 transition-colors">Copy</button>
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-2 leading-relaxed">
                        Use this key to integrate your AI Brain with external environments. API calls are secured via neural encryption.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Session Context Menu Modal */}
      <AnimatePresence>
        {showSessionOptions && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-slate-900 border border-slate-800 rounded-[2.5rem] w-full max-w-sm shadow-[0_32px_64px_rgba(0,0,0,0.8)] overflow-hidden"
            >
              <div className="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Chat Options</h3>
                <button onClick={() => setShowSessionOptions(null)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-500"><X className="w-5 h-5" /></button>
              </div>
              
              <div className="p-4 space-y-2">
                <div className="px-2 pb-4">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block font-mono">Remain & Rename</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={renameTitle}
                      onChange={(e) => setRenameTitle(e.target.value)}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm font-bold text-white focus:border-indigo-500 outline-none"
                      placeholder="Enter new name..."
                    />
                    <button 
                      onClick={() => handleRenameSession(showSessionOptions)}
                      className="p-2 bg-indigo-600 rounded-xl text-white hover:bg-indigo-500 transition-colors"
                      title="Remain"
                    >
                      <Plus className="w-5 h-5 rotate-45" />
                    </button>
                  </div>
                </div>

                <button 
                  onClick={() => {
                    const sess = sessions.find(s => s.id === showSessionOptions);
                    if (sess) togglePrivateSession(showSessionOptions, sess.isPrivate);
                  }}
                  className="w-full p-4 flex items-center gap-3 hover:bg-purple-500/10 rounded-2xl text-slate-300 transition-all group"
                >
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center group-hover:bg-purple-500 transition-colors">
                    {sessions.find(s => s.id === showSessionOptions)?.isPrivate ? <UnlockIcon className="w-5 h-5 text-purple-400 group-hover:text-white" /> : <LockIcon className="w-5 h-5 text-purple-400 group-hover:text-white" />}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">Private Mode</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Hide details from history</p>
                  </div>
                </button>

                <div className="flex items-center gap-3 hover:bg-rose-500/10 rounded-2xl p-4 transition-colors cursor-pointer group" onClick={() => deleteSession(showSessionOptions)}>
                  <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center group-hover:bg-rose-500 transition-colors">
                    <Trash2 className="w-5 h-5 text-rose-500 group-hover:text-white transition-colors" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-rose-500">Delete</p>
                    <p className="text-[10px] text-rose-500/60 font-bold uppercase tracking-widest">Wipe from history</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Set Password Lock Modal */}
      <AnimatePresence>
        {showLockModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center">
                  <LockIcon className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white uppercase tracking-tight">Lock Chat Session</h3>
                  <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">Securing conversation</p>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-xs font-medium text-slate-400">
                  Please enter a custom passcode. Anyone opening this specific folder tab will be requested to input this passcode before they can view your chat logs.
                </p>
                <div className="flex flex-col gap-1.5">
                  <input 
                    type="password"
                    value={lockPasswordInput}
                    onChange={(e) => setLockPasswordInput(e.target.value)}
                    placeholder="Enter customized passcode..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-sky-500 outline-none font-mono"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSetPasswordLock(showLockModal);
                    }}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => {
                        setShowLockModal(null);
                        setLockPasswordInput('');
                    }}
                    className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleSetPasswordLock(showLockModal)}
                    className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-[0_12px_24px_rgba(14,165,223,0.3)]"
                  >
                    Activate Lock
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Verify Password Unlock / Remove Lock Modal */}
      <AnimatePresence>
        {showUnlockModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg animate-fade-in">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden p-6 shadow-2xl relative text-center"
            >
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-4 border border-amber-500/20">
                <LockIcon className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Folder Secured</h3>
              <p className="text-[10px] uppercase font-mono tracking-widest text-amber-400 mt-1">Passcode Required</p>

              <div className="mt-4 space-y-4">
                <p className="text-xs font-medium text-slate-400">
                  This conversation has neural-level passcode defense. Enter password to view messaging history.
                </p>
                <input 
                  type="password"
                  value={unlockPasswordInput}
                  onChange={(e) => setUnlockPasswordInput(e.target.value)}
                  placeholder="Type passcode..."
                  className="w-full text-center bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-base font-bold text-white focus:border-sky-500 outline-none font-mono"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleVerifyPasswordUnlock(showUnlockModal);
                  }}
                  autoFocus
                />
                
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleVerifyPasswordUnlock(showUnlockModal)}
                      className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-[0_12px_24px_rgba(14,165,223,0.3)]"
                    >
                      Verify & Open
                    </button>
                    <button 
                      onClick={() => handleRemovePasswordLock(showUnlockModal)}
                      className="flex-1 py-2.5 bg-amber-600/20 hover:bg-amber-600/35 text-amber-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-amber-500/20"
                    >
                      Delete Lock
                    </button>
                  </div>
                  <button 
                    onClick={() => {
                      setShowUnlockModal(null);
                      setUnlockPasswordInput('');
                    }}
                    className="w-full py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Error Toast Notification */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -30, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -30, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-6 left-1/2 z-[9999] bg-rose-500 text-white px-5 py-4 rounded-3xl shadow-2xl font-bold flex items-start gap-3 w-[90%] max-w-sm sm:max-w-md border border-rose-400/20 backdrop-blur-md"
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-pulse mt-1.5 flex-shrink-0" />
            <span className="flex-1 text-[11px] sm:text-xs tracking-wide leading-relaxed font-sans">{error}</span>
            <button 
              onClick={() => setError(null)} 
              className="hover:scale-110 active:scale-95 transition-transform text-white/80 hover:text-white p-1 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Success Toast Notification */}
      <AnimatePresence>
        {successMsg && (
          <motion.div 
            initial={{ opacity: 0, y: -30, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -30, x: "-50%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed top-6 left-1/2 z-[9999] bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-3 w-[90%] max-w-xs sm:max-w-sm border border-emerald-500/20 backdrop-blur-md text-xs"
          >
            <div className="w-2 h-2 bg-white rounded-full animate-pulse flex-shrink-0" />
            <span className="flex-1 font-semibold">{successMsg}</span>
            <button 
              onClick={() => setSuccessMsg(null)} 
              className="hover:scale-110 active:scale-95 transition-transform text-white/80 hover:text-white p-1 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message action options popup menu (triggered on 2s long press) */}
      <AnimatePresence>
        {messageWithOptions && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => setMessageWithOptions(null)} />

            <motion.div
              initial={{ y: "150%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "150%", opacity: 0 }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 z-10 overflow-hidden"
            >
              <div className="w-12 h-1 bg-slate-800 rounded-full mx-auto mb-5 sm:hidden" />
              <h3 className="text-xs font-black text-white uppercase tracking-wider mb-2 text-center sm:text-left text-slate-300">Message Actions</h3>
              <p className="text-slate-500 text-[11px] mb-5 text-center sm:text-left truncate max-w-xs mx-auto sm:mx-0 font-mono italic">
                "{messageWithOptions.text}"
              </p>

              <div className="flex flex-col gap-2">
                {messageWithOptions.sender === 'user' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMessageId(messageWithOptions.id);
                      setInput(messageWithOptions.text);
                      setMessageWithOptions(null);
                      setTimeout(() => textareaRef.current?.focus(), 150);
                    }}
                    className="w-full h-11 rounded-xl flex items-center gap-3 px-4 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-300 hover:text-white transition-all text-xs font-bold uppercase tracking-wider border border-indigo-500/20 hover:border-indigo-600 shadow-md group"
                  >
                    <Pencil className="w-4 h-4 text-indigo-400 group-hover:text-white transition-colors" />
                    Edit Message
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(messageWithOptions.text);
                      setSuccessMsg("Copied message to clipboard!");
                      setTimeout(() => setSuccessMsg(null), 2500);
                    } catch (err) {
                      // Canvas/iframe fallback helper
                      try {
                        const el = document.createElement('textarea');
                        el.value = messageWithOptions.text;
                        document.body.appendChild(el);
                        el.select();
                        document.execCommand('copy');
                        document.body.removeChild(el);
                        setSuccessMsg("Copied message to clipboard!");
                        setTimeout(() => setSuccessMsg(null), 2500);
                      } catch (copyErr) {
                        console.error("Copy operation unsuccessful", copyErr);
                      }
                    }
                    setMessageWithOptions(null);
                  }}
                  className="w-full h-11 rounded-xl flex items-center gap-3 px-4 bg-slate-850 hover:bg-slate-800 text-slate-200 hover:text-white transition-all text-xs font-bold uppercase tracking-wider border border-slate-800 shadow-md"
                >
                  <Copy className="w-4 h-4 text-slate-400" />
                  Copy Content
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    const msgRefPath = `users/${user.uid}/chats/${activeSessionId}/messages`;
                    try {
                      await deleteDoc(doc(db, msgRefPath, messageWithOptions.id));
                    } catch (err) {
                      console.error("Delete failed", err);
                    }
                    setMessageWithOptions(null);
                  }}
                  className="w-full h-11 rounded-xl flex items-center gap-3 px-4 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-xs font-bold uppercase tracking-wider border border-rose-500/25 hover:border-rose-600 shadow-md"
                >
                  <Trash2 className="w-4 h-4 text-rose-400" />
                  Delete Message
                </button>

                <button
                  type="button"
                  onClick={() => setMessageWithOptions(null)}
                  className="w-full h-10 mt-2 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors text-xs font-bold uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
