import React, { useState } from 'react';
import { useAuth } from './useAuth';
import { UserPlus } from 'lucide-react';

export default function Signup({ onSwitchToLogin, onSignupSuccess }) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSuccess(false);

    if (!mobileNumber.match(/^\+\d{1,15}$/)) {
      setError('Mobile number must be in E.164 format (e.g., +919876543210).');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      setLoading(false);
      return;
    }

    const { error: signUpError } = await signUp(
      email, 
      password, 
      fullName, 
      mobileNumber, 
      accountNumber
    );

    if (signUpError) {
      setError(signUpError.message || 'Signup failed. Please try again.');
      setLoading(false);
    } else {
      setSuccess(true);
      setLoading(false);
      // Wait 2 seconds then call the success callback
      setTimeout(() => {
        onSignupSuccess?.();
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-blue-900">
      <div className="w-full max-w-lg p-8 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700">
  
        <div className="flex items-center justify-center mb-6">
          <UserPlus className="w-8 h-8 text-blue-600 dark:text-blue-400 mr-2" />
          <h2 className="text-3xl font-extrabold text-gray-900 dark:text-white">Create Account</h2>
        </div>
  
        {success ? (
          <div className="p-4 bg-green-100 dark:bg-green-900/40 border border-green-300 dark:border-green-700 rounded-lg text-center">
            <p className="text-lg font-semibold text-green-800 dark:text-green-300">
              ✓ Account Created Successfully!
            </p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-2">
              Redirecting to login...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
  
            <InputGroup 
              label="Full Name"
              id="fullName"
              type="text"
              value={fullName}
              onChange={setFullName}
              placeholder="John Doe"
              required
            />
  
            <InputGroup 
              label="Account Number"
              id="accountNumber"
              type="text"
              value={accountNumber}
              onChange={setAccountNumber}
              placeholder="1234567890"
              required
            />
  
            <InputGroup 
              label="Mobile Number (E.164)"
              id="mobileNumber"
              type="tel"
              value={mobileNumber}
              onChange={setMobileNumber}
              placeholder="+919876543210"
              required
              helpText="Must be in E.164 format (e.g., +91...)"
            />
  
            <InputGroup 
              label="Email ID"
              id="email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="your.email@example.com"
              required
            />
  
            <InputGroup 
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              minLength={6}
              helpText="Minimum 6 characters"
            />
  
            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">{error}</p>
              </div>
            )}
  
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed"
            >
              {loading ? 'Creating account...' : 'Sign Up'}
            </button>
  
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={onSwitchToLogin}
                className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
              >
                Already have an account? Login
              </button>
            </div>
          </form>
        )}
  
      </div>
    </div>
  );  
}

const InputGroup = ({ label, id, type, value, onChange, placeholder, required, minLength, helpText }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      {label}
      {required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      minLength={minLength}
      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white transition-shadow"
    />
    {helpText && (
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helpText}</p>
    )}
  </div>
);