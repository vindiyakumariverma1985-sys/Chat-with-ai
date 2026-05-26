import { useEffect, useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged,
  onIdTokenChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { auth } from '../lib/firebase';
import { LogIn, Key, Mail, Cpu } from 'lucide-react';
import { motion } from 'motion/react';
import { Logo } from './Logo';

// --- Auth Component ---
export default function AuthFlow({ onAuthSuccess }: { onAuthSuccess: (user: User) => void }) {
  const [view, setView] = useState<'login' | 'signup'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) onAuthSuccess(user);
    });
    return unsubscribe;
  }, [onAuthSuccess]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      if (view === 'signup') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        onAuthSuccess(cred.user);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        onAuthSuccess(cred.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      onAuthSuccess(result.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-200 flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Bio-luminescent background effects for visibility */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 rounded-full blur-[120px] animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 rounded-full blur-[120px] animate-pulse delay-700"></div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] p-10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] relative z-10"
      >
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_auto] animate-gradient-x rounded-t-full"></div>
        
        <div className="flex flex-col items-center mb-10">
          <div className="mb-5 group transition-transform hover:scale-110">
            <Logo className="w-20 h-20 drop-shadow-[0_0_20px_rgba(99,102,241,0.3)]" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-1">Chat <span className="text-indigo-400">with</span> AI</h1>
          <p className="text-slate-400 text-center text-[10px] font-bold uppercase tracking-[0.2em] opacity-80 mt-1">Advanced reasoning • Secure Access</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-2xl mb-8 text-sm font-medium flex items-center gap-3"
          >
            <div className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping"></div>
            {error}
          </motion.div>
        )}

        <div className="space-y-6">
          <button 
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full bg-white text-slate-950 hover:bg-slate-100 font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-white/5"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 12.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-800"></div></div>
            <div className="relative flex justify-center text-[10px] uppercase tracking-[0.3em] font-black"><span className="bg-slate-900/80 backdrop-blur-xl px-4 text-slate-500">Secure Gateway</span></div>
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-5">
            <div className="space-y-2">
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 transition-colors group-focus-within:text-indigo-400" />
                <input 
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm placeholder:text-slate-700"
                  placeholder="Email Address"
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative group">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 transition-colors group-focus-within:text-indigo-400" />
                <input 
                  type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all text-sm placeholder:text-slate-700"
                  placeholder="Password"
                />
              </div>
            </div>
            
            <button 
              disabled={loading}
              className="w-full bg-indigo-500 text-white font-black py-4 rounded-2xl mt-2 flex items-center justify-center gap-3 hover:bg-indigo-600 transition-all shadow-[0_20px_40px_-12px_rgba(99,102,241,0.4)] active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Authorizing...' : view === 'signup' ? 'Create Secure Account' : 'Access Dashboard'}
              <LogIn className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center gap-4 mt-8">
              <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                {view === 'signup' ? 'Back to' : 'New here?'} 
                <button 
                  type="button" 
                  onClick={() => setView(view === 'signup' ? 'login' : 'signup')} 
                  className="text-indigo-400 hover:text-indigo-300 ml-2 border-b border-indigo-400/30 hover:border-indigo-400/100 transition-all"
                >
                  {view === 'signup' ? 'Login' : 'Signup'}
                </button>
              </p>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
