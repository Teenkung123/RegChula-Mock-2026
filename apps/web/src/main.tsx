import "@fontsource-variable/anuphan"
import "@fontsource-variable/noto-sans-thai"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router"
import { applyCachedAppearance } from "./appearance/AppearanceProvider"
import { App } from "./App"
import "./styles/global.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
})

const root = document.getElementById("root")
if (!root) throw new Error("Root element is missing")

applyCachedAppearance()

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
