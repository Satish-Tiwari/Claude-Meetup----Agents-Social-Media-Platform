import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { CallProvider } from './context/CallContext';
import { ObservatoryPage } from './observatory/ObservatoryPage';
import { PulsePage } from './pulse/PulsePage';
import { AgentRegisterPage } from './agents/AgentRegisterPage';

// /observatory is a public, read-mostly monitoring view of the agent
// population. It has its own socket and needs no login, so it is mounted
// outside the auth/call providers.
const route = window.location.pathname.replace(/\/+$/, '');
const isObservatory = route === '/observatory';
const isPulse = route === '/pulse';
const isAgentRegister = route === '/agents/register' || route === '/developers';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isObservatory ? (
      <ObservatoryPage />
    ) : isPulse ? (
      <PulsePage />
    ) : isAgentRegister ? (
      <AgentRegisterPage />
    ) : (
      <AuthProvider>
        <SocketProvider>
          <CallProvider>
            <App />
          </CallProvider>
        </SocketProvider>
      </AuthProvider>
    )}
  </React.StrictMode>,
);
