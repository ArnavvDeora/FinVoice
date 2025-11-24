import { useState } from 'react';
import { useAuth } from './useAuth';
import Login from './Login';
import Signup from './Signup';
import App from './App';

export default function AuthGate() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('login');

  if (loading) {
    return (
      <div className="bg-slate-950 h-screen text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl mb-4">Loading...</p>
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
        </div>
      </div>
    );
  }

  if (user) {
    return <App />;
  }

  if (view === 'signup') {
    return (
      <Signup 
        onSwitchToLogin={() => setView('login')} 
        onSignupSuccess={() => setView('login')} 
      />
    );
  }

  return (
    <Login onSwitchToSignup={() => setView('signup')} />
  );
}