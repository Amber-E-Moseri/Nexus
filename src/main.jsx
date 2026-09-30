import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Analytics } from '@vercel/analytics/react'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { NotificationsProvider } from './context/NotificationsContext'
import { InboxCountProvider } from './context/InboxCountContext'
import { ToastProvider } from './context/ToastContext'
import { analyticsBeforeSend } from './lib/analytics'
import { queryClient } from './lib/queryClient'
import { applyUiTheme } from './lib/uiTheme'
import './styles/index.css'

applyUiTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <NotificationsProvider>
            <InboxCountProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </InboxCountProvider>
          </NotificationsProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
    <Analytics beforeSend={analyticsBeforeSend} />
  </React.StrictMode>,
)
