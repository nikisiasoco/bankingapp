import { Theme } from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import { App } from './App';
import { ApiError } from './api/client';
import './styles.css';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      // If the session goes away mid-browse, drop straight back to sign in
      // rather than leaving the user staring at an error they cannot act on.
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(['me'], null);
      }
    },
  }),
  defaultOptions: {
    // A 4xx from this API is a definitive answer. Retrying only delays it.
    queries: { retry: false },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <Theme accentColor="indigo" grayColor="slate" radius="medium">
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </Theme>
  </StrictMode>,
);
