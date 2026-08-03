"use client";

import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/widgets/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileSection, type SettingsUser } from "@/components/features/settings/profile-section";
import { IntegrationsMatrix } from "@/components/features/settings/integrations-matrix";
import { ApiKeysSection, type ApiKeyT } from "@/components/features/settings/api-keys-section";
import { NotificationPrefs } from "@/components/features/settings/notification-prefs";
import { DangerZone } from "@/components/features/settings/danger-zone";

interface SettingsData {
  user: SettingsUser;
  preferences: Record<string, unknown>;
  apiKeys: ApiKeyT[];
  integrations: Record<string, unknown>;
}

interface SectionProps {
  title: string;
  description: string;
  index: number;
  children: React.ReactNode;
}

function Section({ title, description, index, children }: SectionProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="space-y-3"
    >
      <div>
        <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </motion.section>
  );
}

export default function SettingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SettingsData>("/settings"),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Settings"
        description="Profile, integrations, API access and notification preferences."
      />

      {isLoading && (
        <div className="space-y-8">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-5 w-40 rounded-lg" />
              <Skeleton className="h-40 rounded-2xl" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && data && (
        <>
          <Section
            index={0}
            title="Profile"
            description="How you appear across the studio."
          >
            <ProfileSection user={data.user} />
          </Section>

          <Section
            index={1}
            title="Integrations"
            description="Live capability matrix — green is real, amber runs on the built-in mock or fallback."
          >
            <IntegrationsMatrix />
          </Section>

          <Section
            index={2}
            title="API keys"
            description="Programmatic access for scripts, Zapier and custom tooling."
          >
            <ApiKeysSection apiKeys={data.apiKeys} />
          </Section>

          <Section
            index={3}
            title="Notifications"
            description="What lands in your notification tray (and Discord, if enabled)."
          >
            <NotificationPrefs preferences={data.preferences} />
          </Section>

          <Section index={4} title="Danger zone" description="Careful past this point.">
            <DangerZone />
          </Section>
        </>
      )}
    </div>
  );
}
