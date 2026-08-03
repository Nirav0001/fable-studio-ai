import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

export const metadata: Metadata = {
  title: { default: "Fable Studio AI", template: "%s · Fable Studio AI" },
  description:
    "AI-powered faceless YouTube Shorts studio — generate, edit, schedule and upload across every channel on autopilot.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${grotesk.variable}`}>
      <body className="font-sans">
        <QueryProvider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: {
                background: "hsl(258 32% 8%)",
                border: "1px solid hsl(263 60% 60% / 0.2)",
                color: "hsl(260 25% 96%)",
              },
            }}
          />
        </QueryProvider>
      </body>
    </html>
  );
}
