"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { EASE_OUT, SPRING_CELEBRATE } from "@/lib/motion";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (isRegister && password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      if (isRegister) {
        await api.post("/auth/register", { name, email, password });
        toast.success("Account created — welcome to the studio");
      } else {
        await api.post("/auth/login", { email, password });
        toast.success("Welcome back");
      }
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode((m) => (m === "login" ? "register" : "login"));
    setPassword("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="glass w-full max-w-md rounded-3xl p-8"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="gradient-primary mb-4 flex h-14 w-14 items-center justify-center rounded-2xl glow-primary">
            <Wand2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Fable Studio <span className="gradient-text">AI</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {isRegister
              ? "Create your account to start building."
              : "Your faceless Shorts empire, on autopilot."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <AnimatePresence initial={false}>
            {isRegister && (
              <motion.div
                className="grid"
                initial={{ gridTemplateRows: "0fr", opacity: 0 }}
                animate={{ gridTemplateRows: "1fr", opacity: 1 }}
                exit={{ gridTemplateRows: "0fr", opacity: 0 }}
                transition={SPRING_CELEBRATE}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name</Label>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={isRegister ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? "At least 8 characters" : "••••••••"}
              minLength={isRegister ? 8 : undefined}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isRegister ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isRegister ? "Already have an account?" : "New to Fable Studio?"}{" "}
          <button
            type="button"
            onClick={switchMode}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {isRegister ? "Sign in" : "Create an account"}
          </button>
        </p>
      </motion.div>
    </div>
  );
}
