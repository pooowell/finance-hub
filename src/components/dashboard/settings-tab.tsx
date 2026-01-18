"use client";

import { Settings } from "lucide-react";

export function SettingsTab() {
  return (
    <div className="bg-card rounded-lg border border-border p-8 text-center">
      <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Settings</h3>
      <p className="text-muted-foreground">
        Coming soon. Account preferences and app settings will be available here.
      </p>
    </div>
  );
}
