import { useState } from 'react';

export default function MobileVerification({ onVerify }) {
  const [code, setCode] = useState('');

  const handleVerify = () => {
    // MOCK Verification for demo purposes
    if (code === '123456') {
      onVerify();
    } else {
      alert("Invalid Code. Try 123456");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
      <div className="w-full max-w-md p-8 bg-slate-900 rounded-2xl border border-slate-800 text-center">
        <h2 className="text-2xl font-bold mb-2">Verify Phone</h2>
        <p className="text-slate-400 mb-6">Enter the code sent to your device</p>
        <input 
          type="text" 
          placeholder="123456" 
          className="w-full p-4 text-center text-2xl bg-black rounded border border-slate-700 mb-6 tracking-widest" 
          value={code}
          onChange={e => setCode(e.target.value)}
        />
        <button onClick={handleVerify} className="w-full bg-green-600 p-3 rounded font-bold hover:bg-green-500">Verify</button>
      </div>
    </div>
  );
}