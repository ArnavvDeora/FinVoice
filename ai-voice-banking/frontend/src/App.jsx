// src/App.jsx
import { useState, useEffect, useRef, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { useAuth } from './useAuth'

// UI Libraries
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend 
} from 'recharts'
import { 
  Mic, MicOff, ShieldCheck, AlertTriangle, Plus,
  CreditCard, Activity, TrendingUp, Lock, 
  MoreHorizontal, LogOut, DollarSign, RefreshCw, X, CheckCircle, Clock, 
  ShoppingBag, Utensils, Zap, Stethoscope, UserPlus, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// --- Utilities ---
function cn(...inputs) {
  return twMerge(clsx(inputs))
}

function formatDate(timestamp) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

// --- Custom Chart Tooltip ---
const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700 p-4 rounded-xl shadow-2xl">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }}></div>
            <p className="text-slate-400 text-xs uppercase tracking-wider">{payload[0].name}</p>
          </div>
          <p className="text-white font-bold text-lg font-mono">${payload[0].value}</p>
        </div>
      );
    }
    return null;
};

// --- Constants ---
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
// Hardcoded for demo, but prefer .env in production
const OPENAI_KEY = import.meta.env.VITE_OPENAI_KEY 

const BANK_NAME = "NEXUS PRIME BANK"
const WS_URL = 'ws://localhost:5000/stream'

const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6'];

// --- Bank Knowledge Base ---
const BANK_KNOWLEDGE = `
Bank Name: Nexus Prime Bank.
User Account Type: Nexus Platinum Savings.
Current Interest Rate: 4.5% APY.
Credit Cards:
1. Nexus Infinite Card: 5% cashback on Travel & Dining, Free Airport Lounge Access.
2. Nexus Gold Card: 2% flat cashback.
`

export default function App() {
  // Auth State
  const { user, signOut } = useAuth();

  // App State
  const [userProfile, setUserProfile] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [recipients, setRecipients] = useState([]) 
  
  const [messages, setMessages] = useState([])
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [serverStatus, setServerStatus] = useState('disconnected')
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(0);
  const [voiceInput, setVoiceInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('')
  // UI State
  const [emergencyMode, setEmergencyMode] = useState(false)
  const [pendingTransfer, setPendingTransfer] = useState(null)
  const [selectedTx, setSelectedTx] = useState(null)
  const [showAddContact, setShowAddContact] = useState(false) 
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  
  // Form State
  const [newContact, setNewContact] = useState({name:'', account_number:'', ifsc:''}) 
  const [dbError, setDbError] = useState(null)
   
  // Refs
  const ws = useRef(null)
  const audioChunksRef = useRef([]) 
  const chatContainerRef = useRef(null)
  const audioContextRef = useRef(null)
  const processorRef = useRef(null)
  const streamRef = useRef(null)
  
  // 1. NEW: Ref to hold the latest version of handleUserInput
  const handleUserInputRef = useRef(null)

  // --- WebSocket Connection ---
  useEffect(() => {
    connectWebSocket()
    return () => { 
        if(ws.current) ws.current.close()
        stopRecording()
    }
  }, [])

  const connectWebSocket = () => {
    ws.current = new WebSocket(WS_URL)
    ws.current.onopen = () => setServerStatus('connected')
    ws.current.onclose = () => { setServerStatus('disconnected'); setTimeout(connectWebSocket, 3000) }
    ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'transcription' && data.text.trim().length > 1) {
            console.log("🎤 Heard:", data.text)
            stopRecording() 
            
            // 2. FIXED: Call the latest function from Ref instead of stale closure
            if (handleUserInputRef.current) {
                handleUserInputRef.current(data.text)
            }
        }
        if (data.type === 'audio_chunk') audioChunksRef.current.push(data.data)
        if (data.type === 'audio_end') playAudioFromChunks()
    }
  }

  const playAudioFromChunks = async () => {
    if (audioChunksRef.current.length === 0) return
    try {
        const byteArrays = audioChunksRef.current.map(chunk => {
            const binaryString = atob(chunk)
            const len = binaryString.length
            const bytes = new Uint8Array(len)
            for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i)
            return bytes
        })
        const audioBlob = new Blob(byteArrays, { type: 'audio/wav' })
        const audioUrl = URL.createObjectURL(audioBlob)
        new Audio(audioUrl).play()
    } catch (e) { console.error("Audio playback error", e) }
    audioChunksRef.current = []
  }

  // --- Microphone Logic (AudioWorklet) ---
  const startRecording = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream
        const AudioContext = window.AudioContext || window.webkitAudioContext
        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
        
        const workletCode = `
          class RecorderProcessor extends AudioWorkletProcessor {
            constructor() {
              super();
              this.bufferSize = 4096;
              this.buffer = new Float32Array(this.bufferSize);
              this.index = 0;
            }
            process(inputs, outputs, parameters) {
              const input = inputs[0];
              if (input && input.length > 0) {
                const channelData = input[0];
                for (let i = 0; i < channelData.length; i++) {
                  this.buffer[this.index++] = channelData[i];
                  if (this.index >= this.bufferSize) {
                    this.port.postMessage(this.buffer);
                    this.index = 0;
                  }
                }
              }
              return true;
            }
          }
          registerProcessor('recorder-worklet', RecorderProcessor);
        `;

        const blob = new Blob([workletCode], { type: 'application/javascript' });
        const workletUrl = URL.createObjectURL(blob);

        await audioContextRef.current.audioWorklet.addModule(workletUrl);

        const source = audioContextRef.current.createMediaStreamSource(stream);
        const workletNode = new AudioWorkletNode(audioContextRef.current, 'recorder-worklet');

        workletNode.port.onmessage = (event) => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                const inputData = event.data;
                const buffer = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                let binary = '';
                const bytes = new Uint8Array(buffer.buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i+=1024) {
                   binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 1024, len)));
                }
                
                const base64Audio = btoa(binary);
                ws.current.send(JSON.stringify({ type: 'audio_input', data: base64Audio }));
            }
        };

        source.connect(workletNode);
        workletNode.connect(audioContextRef.current.destination); 
        processorRef.current = workletNode;
        setIsListening(true);

    } catch (err) {
        console.error("Microphone Error:", err);
        addBotMessage("Microphone access denied or not supported.", true);
    }
  }

  const stopRecording = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    if (processorRef.current) processorRef.current.disconnect()
    if (audioContextRef.current) audioContextRef.current.close()
    setIsListening(false)
  }

  const toggleListening = () => { isListening ? stopRecording() : startRecording() }

  // --- SUPABASE DATA LOADING ---
  useEffect(() => {
    if (user) loadSupabaseData()
  }, [user])

  useEffect(() => {
    if (chatContainerRef.current) chatContainerRef.current.scrollTo({ top: chatContainerRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const loadSupabaseData = async () => {
    if (!user) return;
    try {
        setLoadingData(true)
        console.log("🔄 Fetching Bank Data...")
        
        let { data: account } = await supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle() 

        if (!account) {
            console.log("🌱 No account found. Triggering Onboarding...")
            setShowOnboarding(true)
            setLoadingData(false)
            return;
        }

        if (account) {
            setUserProfile(account)
            setBalance(account.balance) 

            const { data: txs } = await supabase
                .from('bank_transactions')
                .select('*')
                .eq('account_id', account.id)
                .order('created_at', { ascending: false })
            
            if(txs) setTransactions(txs)

            const { data: recs } = await supabase
                .from('bank_recipients')
                .select('*')
                .eq('user_id', user.id)
            
            if(recs) {
                const enriched = recs.map((c, i) => ({
                    ...c,
                    initials: c.name ? c.name.slice(0, 2).toUpperCase() : '??',
                    color: ['bg-pink-500', 'bg-blue-500', 'bg-indigo-500', 'bg-teal-500'][i % 4]
                }))
                setRecipients(enriched)
            }
        }
    } catch (e) {
        console.error("Critical Error:", e)
    } finally {
        setLoadingData(false)
    }
  }

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    const newAccount = {
        user_id: user.id,
        account_name: formData.get('holderName'),
        account_number: formData.get('accountNumber'),
        balance: parseFloat(formData.get('initialBalance')),
        type: formData.get('accountType') || 'Savings'
    };

    try {
        const { data, error } = await supabase.from('bank_accounts').insert(newAccount).select().single();
        
        if (error) throw error;

        if (data) {
            setUserProfile(data);
            setShowOnboarding(false);
            await supabase.from('bank_transactions').insert({
                account_id: data.id,
                type: 'credit',
                amount: data.balance,
                description: 'Initial Deposit',
                category: 'Deposit'
            });
            loadSupabaseData();
        }
    } catch (err) {
        console.error("Onboarding Error:", err);
        alert("Error creating account: " + err.message);
    }
  }

  // --- Core Transaction Logic ---
  const handleTransaction = async (recipientName, amount) => {
    if (!user || !userProfile) return;
    setStatusMessage("Processing...");

    const { data: contact, error: contactError } = await supabase
      .from('bank_recipients')
      .select('*') 
      .eq('user_id', user.id)
      .ilike('name', recipientName)
      .single();

    if (contactError || !contact) {
      const msg = `User "${recipientName}" not in contacts. Please add them first.`;
      console.warn(msg);
      addBotMessage(msg, true);
      speak(`I couldn't find ${recipientName} in your contacts. Please add them manually first.`);
      setStatusMessage("Contact not found");
      return { status: 'failed' };
    }

   try {
        const { data, error } = await supabase.rpc('transfer_money', { 
            sender_id: user.id,
            amount: parseFloat(amount),
            recipient_name: recipientName 
        });

        if (error) throw error;

        if (data && data.status === 'success') {
            const successMsg = `Successfully sent $${amount} to ${recipientName}.`;
            addBotMessage(successMsg);
            speak(`Transfer of ${amount} dollars to ${recipientName} successful.`);
            setStatusMessage("Transfer Successful");
            
            const newBalance = parseFloat(userProfile.balance) - parseFloat(amount);
            setBalance(newBalance);
            setUserProfile(prev => ({ ...prev, balance: newBalance }));
            
            loadSupabaseData(); 
        } else {
            throw new Error(data?.message || "Transaction declined");
        }
    } catch (err) {
        console.error("Transaction failed:", err);
        const errMsg = "Transfer failed: " + err.message;
        addBotMessage(errMsg, true);
        speak("I encountered an error processing the transfer.");
        setStatusMessage("Transaction Failed");
    }
  };

  const spendingData = useMemo(() => {
    const categories = {}
    transactions.forEach(t => {
      if (t.type === 'debit') {
        const cat = t.category || 'Others'
        categories[cat] = (categories[cat] || 0) + parseFloat(t.amount)
      }
    })
    return Object.keys(categories).map(key => ({ name: key, value: categories[key] }))
  }, [transactions])

  // --- AI Logic ---
  const getAIResponse = async (userMessage) => {
    if (!OPENAI_KEY) return { intent: 'ERROR', message_to_speak: "API Key Missing." }

    // Logic check: Use updated balance context
    // UPDATED PROMPT FOR MULTILINGUAL SUPPORT
    const systemPrompt = `You are NOVA, a banking AI. 
    Context: Balance $${userProfile?.balance || 0}.
    Intents: TRANSFER_MONEY, PAY_MERCHANT, LOG_EXPENSE, CHECK_BALANCE, SPENDING_ANALYSIS, EMERGENCY_FREEZE, GENERAL_HELP.
    
    You are multilingual. Always reply in the same language the user speaks. If the user speaks Hindi, reply in Hindi.
    
    Rules:
    1. "Transfer to myself/me" -> Intent: TRANSFER_MONEY, Recipient: "Self".
    2. "Transfer to Zomato" -> Intent: PAY_MERCHANT, Category: "Food".
    3. "Transfer to Aditi" -> Intent: TRANSFER_MONEY, Recipient: "Aditi".
    
    Output JSON ONLY: { "intent": "string", "amount": number|null, "recipient": string|null, "merchant": string|null, "category": string|null, "message_to_speak": "string" }`

    try {
      const resp = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo', 
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
          temperature: 0.3
        })
      })
      
      if(!resp.ok) throw new Error("API Error")
      const data = await resp.json()
      const rawContent = data.choices[0]?.message?.content || ''
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) return JSON.parse(jsonMatch[0])
      return { intent: 'GENERAL_HELP', message_to_speak: rawContent.replace(/"/g, '') }
    } catch (e) {
      return { intent: 'ERROR', message_to_speak: "I'm unable to connect." }
    }
  }

  const handleUserInput = async (text) => {
    if (!text.trim()) return
    if (isListening) stopRecording() 
    
    setIsProcessing(true)
    setMessages(prev => [...prev, { role: 'user', content: text, timestamp: new Date() }])

    if (pendingTransfer) {
       if (text.toLowerCase().includes('confirm') || text.toLowerCase().includes('yes')) {
           await handleTransaction(pendingTransfer.recipient, pendingTransfer.amount)
           setPendingTransfer(null)
           setIsProcessing(false)
           return
       } else if (text.toLowerCase().includes('cancel')) {
           setPendingTransfer(null)
           addBotMessage("Cancelled.")
           setIsProcessing(false)
           return
       }
    }

    const aiData = await getAIResponse(text)
    const txAmount = aiData.amount || 0;

    if (['TRANSFER_MONEY', 'PAY_MERCHANT', 'LOG_EXPENSE'].includes(aiData.intent)) {
        if (userProfile.balance < txAmount) {
            const errorMsg = `Insufficient funds. Your balance is only $${userProfile.balance}.`
            addBotMessage(errorMsg, true) 
            speak(errorMsg)
            setIsProcessing(false)
            return
        }
    }
    
    switch (aiData.intent) {
      case 'EMERGENCY_FREEZE':
        setEmergencyMode(true)
        addBotMessage("EMERGENCY PROTOCOL ACTIVATED.", true)
        speak("Emergency protocol activated. Accounts frozen.")
        break;
      case 'TRANSFER_MONEY':
        let cleanRecipient = aiData.recipient || 'Unknown';
        if (['myself', 'me', 'self', 'my account'].includes(cleanRecipient.toLowerCase())) cleanRecipient = "Self";
        else cleanRecipient = cleanRecipient.charAt(0).toUpperCase() + cleanRecipient.slice(1);
        
        const knownContact = recipients.find(r => r.name.toLowerCase().includes(cleanRecipient.toLowerCase()));
        
        if (knownContact) {
             await handleTransaction(knownContact.name, txAmount); 
             break;
        }

        setPendingTransfer({ 
            amount: txAmount, 
            recipient: cleanRecipient, 
            category: 'Transfer',
            contactDetails: knownContact 
        })

        addBotMessage(`Transfer $${txAmount} to ${cleanRecipient}? Say Confirm.`)
        speak(`Transfer ${txAmount} dollars to ${cleanRecipient}? Please confirm.`)
        break;
      case 'PAY_MERCHANT':
        await logExpense(txAmount, aiData.category || 'Shopping', aiData.merchant)
        addBotMessage(`Paid $${txAmount} to ${aiData.merchant}.`)
        speak(`Paid ${txAmount} dollars to ${aiData.merchant}.`)
        break;
      case 'LOG_EXPENSE': 
        await logExpense(txAmount, aiData.category || 'General', 'Manual Entry')
        addBotMessage(`Logged $${txAmount} for ${aiData.category}.`)
        speak(`Logged ${txAmount} dollars for ${aiData.category}.`)
        break;
      default:
        addBotMessage(aiData.message_to_speak)
        speak(aiData.message_to_speak)
    }
    setIsProcessing(false)
  }

  // 3. NEW: Keep Ref updated with the latest handleUserInput (which captures latest userProfile)
  useEffect(() => {
    handleUserInputRef.current = handleUserInput
  }, [handleUserInput])

  const logExpense = async (amount, category, merchant = 'Unknown') => {
    if (!amount || !userProfile) return
    const description = merchant !== 'Unknown' ? `Payment to ${merchant}` : `Expense: ${category}`
    
    const { data: newTx } = await supabase.from('bank_transactions').insert({
            account_id: userProfile.id,
            type: 'debit', amount: amount, description, category
        }).select().single()

    if (newTx) {
        setTransactions(prev => [newTx, ...prev])
        const newBalance = parseFloat(userProfile.balance) - parseFloat(amount)
        setUserProfile(prev => ({ ...prev, balance: newBalance }))
        await supabase.from('bank_accounts').update({ balance: newBalance }).eq('id', userProfile.id)
    }
  }

  const executeTransfer = async (details) => {
    if (!userProfile) return
    const description = details.recipient === 'Self' ? 'Self Transfer' : `Transfer to ${details.recipient}`;
    
    const { data: newTx } = await supabase.from('bank_transactions').insert({
            account_id: userProfile.id,
            type: 'debit', 
            amount: details.amount, 
            description: description, 
            category: 'Transfer',
            recipient_name: details.recipient
        }).select().single()

    if (newTx) {
        setTransactions(prev => [newTx, ...prev])
        const newBalance = parseFloat(userProfile.balance) - parseFloat(details.amount)
        setUserProfile(prev => ({ ...prev, balance: newBalance }))
        await supabase.from('bank_accounts').update({ balance: newBalance }).eq('id', userProfile.id)
        addBotMessage(`Transferred $${details.amount}.`)
        speak(`Transferred ${details.amount} dollars.`)
    }
  }

  const addNewContact = async (e) => {
    e.preventDefault()
    if(!user) return

    try {
        const { data: newContactData, error } = await supabase.from('bank_recipients').insert({
            user_id: user.id,
            name: newContact.name,
            account_number: newContact.account_number,
            ifsc_code: newContact.ifsc
        }).select().single()

        if (error) throw error;

        if (newContactData) {
            const enrichedContact = {
                ...newContactData,
                initials: newContactData.name.slice(0, 2).toUpperCase(),
                color: 'bg-teal-500'
            }
            setRecipients(prev => [...prev, enrichedContact])
            setShowAddContact(false)
            setNewContact({name:'', account_number:'', ifsc:''})
        } 
    } catch (err) {
        console.error("Contact Add Error:", err)
        alert("Failed to add contact: " + err.message)
    }
  }

  const addBotMessage = (text, isAlert = false) => {
    setMessages(prev => [...prev, { role: 'assistant', content: text, isAlert, timestamp: new Date() }])
  }

  const speak = (text) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'tts_request', text: text }))
    } else {
        const u = new SpeechSynthesisUtterance(text)
        window.speechSynthesis.speak(u)
    }
  }

  if (!user && !loadingData) {
      return <div className="h-screen w-full flex items-center justify-center bg-slate-950 text-white">
          <div className="text-center">
             <h2 className="text-2xl font-bold mb-4">Authentication Required</h2>
             <p>Please log in via the login screen.</p>
          </div>
      </div>
  }

  // --- RENDER ---
  return (
    <div className={cn("h-screen w-full overflow-hidden bg-slate-950 text-white font-sans selection:bg-cyan-500 selection:text-white", emergencyMode ? "bg-red-950" : "bg-slate-950")}>
      
      {/* ONBOARDING MODAL */}
      {showOnboarding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
              <form onSubmit={handleOnboardingSubmit} className="bg-slate-900 p-8 rounded-2xl border border-slate-700 w-96 shadow-2xl animate-in fade-in zoom-in">
                  <div className="flex flex-col items-center mb-6">
                      <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mb-4 text-cyan-400">
                          <ShieldCheck size={40} />
                      </div>
                      <h2 className="text-2xl font-bold text-white">Setup Your Account</h2>
                      <p className="text-slate-400 text-sm mt-1">Welcome to Nexus Prime Bank</p>
                  </div>

                  <div className="space-y-4">
                      <div>
                          <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Account Holder Name</label>
                          <input name="holderName" required placeholder="e.g. John Doe" className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-cyan-500 outline-none" />
                      </div>
                      <div>
                          <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Account Number</label>
                          <input name="accountNumber" required placeholder="e.g. 4492 8192..." className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-cyan-500 outline-none" />
                      </div>
                       <div>
                          <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Account Type</label>
                          <select name="accountType" className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-cyan-500 outline-none">
                              <option value="Savings">Savings Account</option>
                              <option value="Current">Current Account</option>
                          </select>
                      </div>
                      <div>
                          <label className="text-xs text-slate-500 uppercase font-bold tracking-wider ml-1">Initial Balance ($)</label>
                          <input name="initialBalance" type="number" required placeholder="5000.00" className="w-full p-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:border-cyan-500 outline-none" />
                      </div>
                  </div>

                  <button type="submit" className="w-full mt-6 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-cyan-900/20 transition-all transform hover:scale-[1.02]">
                      Create Account
                  </button>
              </form>
          </div>
      )}

      {/* Database Error Overlay */}
      {dbError && (
        <div className="fixed top-0 left-0 w-full bg-red-600 text-white text-center p-2 font-bold z-50 animate-pulse">
            ⚠️ {dbError}. Please check Supabase setup.
        </div>
      )}

      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setSelectedTx(null)}>
            <div className="bg-slate-900 border border-slate-700 p-6 rounded-2xl max-w-sm w-full m-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedTx(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center text-green-500 mb-4"><CheckCircle size={32} /></div>
                    <h2 className="text-xl font-bold text-white">Payment Successful</h2>
                    <p className="text-slate-400 text-sm">{formatDate(selectedTx.created_at)}</p>
                </div>
                <div className="space-y-4 border-t border-slate-800 pt-4">
                    <div className="flex justify-between"><span className="text-slate-400">Amount</span><span className="text-xl font-bold text-white">${selectedTx.amount}</span></div>
                    <div className="flex justify-between"><span className="text-slate-400">To/For</span><span className="text-white font-medium truncate max-w-[150px]">{selectedTx.description}</span></div>
                </div>
            </div>
        </div>
      )}

      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <form onSubmit={addNewContact} className="bg-slate-900 p-6 rounded-xl border border-slate-700 w-80 shadow-2xl">
                <h3 className="text-lg font-bold mb-4 text-white">Add Contact</h3>
                <input placeholder="Name" className="w-full mb-3 p-3 bg-slate-800 border-slate-600 rounded-lg text-white" value={newContact.name} onChange={e=>setNewContact({...newContact, name:e.target.value})} required />
                <input placeholder="Account No" className="w-full mb-3 p-3 bg-slate-800 border-slate-600 rounded-lg text-white" value={newContact.account_number} onChange={e=>setNewContact({...newContact, account_number:e.target.value})} required />
                <input placeholder="IFSC (Optional)" className="w-full mb-3 p-3 bg-slate-800 border-slate-600 rounded-lg text-white" value={newContact.ifsc} onChange={e=>setNewContact({...newContact, ifsc:e.target.value})} />
                <div className="flex gap-2 mt-4">
                    <button type="button" onClick={() => setShowAddContact(false)} className="flex-1 bg-slate-700 p-2 rounded-lg text-white">Cancel</button>
                    <button type="submit" className="flex-1 bg-cyan-600 p-2 rounded-lg text-white">Add</button>
                </div>
            </form>
        </div>
      )}

      {emergencyMode && (
        <div className="fixed inset-0 z-50 bg-red-600/20 backdrop-blur-sm flex items-center justify-center border-8 border-red-600 animate-pulse">
          <div className="bg-black p-10 rounded-3xl border-2 border-red-500 text-center">
            <Lock className="w-20 h-20 text-red-500 mx-auto mb-6" />
            <h1 className="text-4xl font-black text-red-500">ACCOUNT FROZEN</h1>
            <button onClick={() => setEmergencyMode(false)} className="mt-6 px-8 py-3 bg-red-600 text-white rounded-full">DISABLE LOCKDOWN</button>
          </div>
        </div>
      )}

      <div className="h-full w-full max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-3 flex flex-col gap-6 h-full min-h-0">
            <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="text-white w-6 h-6" />
                <div>
                    <h1 className="font-bold text-xl">{BANK_NAME}</h1>
                    <div className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full", serverStatus === 'connected' ? "bg-green-500" : "bg-red-500")}></span>
                        <p className="text-xs text-slate-400">{serverStatus === 'connected' ? "Voice Online" : "Voice Offline"}</p>
                    </div>
                </div>
            </div>
            
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <p className="text-slate-400 text-sm">Total Balance</p>
                <h2 className="text-4xl font-bold mt-2 text-white">
                    {userProfile ? `$${userProfile.balance.toLocaleString()}` : <Loader2 className="animate-spin" />}
                </h2>
                <div className="mt-6 pt-4 border-t border-slate-800">
                      <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">Holder</span><span className="text-white">{userProfile?.account_name || '...'}</span></div>
                      <div className="flex justify-between text-sm"><span className="text-slate-500">Account</span><span className="text-cyan-400 font-mono">{userProfile?.account_number || '...'}</span></div>
                </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-4 flex-1 overflow-hidden flex flex-col min-h-[200px]">
                <div className="flex justify-between items-center mb-4">
                    <p className="text-slate-400 text-xs font-bold uppercase">Quick Contacts</p>
                    <button onClick={() => setShowAddContact(true)} className="text-cyan-400 bg-cyan-400/10 p-1 rounded-lg"><Plus size={16}/></button>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {recipients.map(r => (
                        <div key={r.id} onClick={() => handleUserInput(`Transfer to ${r.name}`)} className="p-3 bg-slate-800/50 hover:bg-slate-800 rounded-xl border border-slate-700/50 flex justify-between items-center cursor-pointer">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full ${r.color || 'bg-slate-600'} flex justify-center items-center text-xs font-bold`}>{r.initials || r.name[0]}</div>
                                <div><span className="text-sm block text-slate-200">{r.name}</span><span className="text-[10px] text-slate-500 block">{r.account_number}</span></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* CENTER COLUMN */}
        <div className="lg:col-span-5 flex flex-col gap-6 h-full min-h-0">
             <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 h-[40%] relative">
                <h3 className="text-slate-300 font-medium mb-2 text-sm uppercase">Spending Analysis</h3>
                <div className="flex-1 min-h-0 w-full h-[90%]">
                    {spendingData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={spendingData} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" paddingAngle={5} dataKey="value">
                                    {spendingData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0)" />)}
                                </Pie>
                                <Legend verticalAlign="middle" align="right" layout="vertical"/>
                                <RechartsTooltip content={<CustomTooltip />} />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">No data available.</div>}
                </div>
            </div>
            <div className="flex-1 min-h-0 bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col">
                 <h3 className="text-slate-300 font-medium mb-4 text-sm uppercase">History</h3>
                 <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-2">
                    {transactions.map(tx => (
                        <div key={tx.id} onClick={() => setSelectedTx(tx)} className="flex justify-between items-center p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/80 cursor-pointer">
                            <div className="flex items-center gap-3">
                                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", tx.type === 'debit' ? "text-slate-400 bg-slate-700/50" : "text-emerald-400 bg-emerald-500/10")}>
                                    {tx.type === 'debit' ? <LogOut size={18}/> : <DollarSign size={18}/>}
                                </div>
                                <div>
                                    <p className="text-sm text-slate-200 font-medium">{tx.description}</p>
                                    <p className="text-xs text-slate-500">{tx.category} • {formatDate(tx.created_at)}</p>
                                </div>
                            </div>
                            <span className={cn("font-mono text-sm font-bold", tx.type === 'debit' ? "text-slate-400" : "text-emerald-400")}>
                                {tx.type === 'debit' ? '-' : '+'}${tx.amount}
                            </span>
                        </div>
                    ))}
                 </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 flex flex-col h-full min-h-0">
            <div className="h-full flex flex-col bg-gradient-to-b from-slate-900 to-black border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
                <div className="p-4 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full animate-pulse ${serverStatus==='connected'?'bg-green-500':'bg-red-500'}`}></div>
                        <span className="font-bold text-cyan-400 tracking-widest text-xs uppercase">NOVA CORE v2.0</span>
                    </div>
                    <button onClick={() => signOut()} className="text-slate-500 hover:text-white text-xs border border-slate-700 px-2 py-1 rounded">Sign Out</button>
                </div>
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed min-h-0">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={cn("flex flex-col max-w-[85%]", msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start")}>
                            <div className={cn("px-4 py-3 rounded-2xl text-sm shadow-md", msg.role === 'user' ? "bg-cyan-600 text-white rounded-tr-sm" : "bg-slate-800 border border-slate-700 text-slate-300 rounded-tl-sm", msg.isAlert ? "border-red-500 bg-red-900/20 text-red-200" : "")}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isProcessing && <div className="text-xs text-cyan-500 animate-pulse pl-4">Thinking...</div>}
                </div>
                <div className="p-4 bg-slate-900 border-t border-slate-800">
                     <div className="relative flex items-center gap-2">
                        <button onClick={toggleListening} className={cn("w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center transition-all shadow-lg", isListening ? "bg-red-500 animate-pulse" : "bg-cyan-600")}>
                            {isListening ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
                        </button>
                        <input type="text" placeholder="Speak or type..." className="flex-1 bg-black/50 border border-slate-700 rounded-full px-5 py-3 text-sm text-white focus:outline-none focus:border-cyan-500" onKeyDown={(e) => { if(e.key === 'Enter') { handleUserInput(e.currentTarget.value); e.currentTarget.value = '' } }} />
                     </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  )
}
