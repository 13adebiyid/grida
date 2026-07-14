"use client";

import React, { createContext, useContext } from "react";

const ExternalAssetUrlContext = createContext<Readonly<Record<string, string>>>(
  {}
);

export function ExternalAssetUrlProvider({
  locations,
  children,
}: React.PropsWithChildren<{
  locations: Readonly<Record<string, string>>;
}>) {
  return (
    <ExternalAssetUrlContext.Provider value={locations}>
      {children}
    </ExternalAssetUrlContext.Provider>
  );
}

function digestFromResourceUri(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^res:\/\/(?:images|videos)\/([a-f0-9]{64})$/.exec(value);
  return match?.[1];
}

export function resolveExternalAssetUrl(
  locations: Readonly<Record<string, string>>,
  value: unknown,
  explicitDigest?: string
): string | undefined {
  const digest = explicitDigest ?? digestFromResourceUri(value);
  if (digest) return locations[digest];
  return typeof value === "string" ? value : undefined;
}

/** Resolve a portable CAS reference without ever putting a host path in the document. */
export function useExternalAssetUrl(
  value: unknown,
  explicitDigest?: string
): string | undefined {
  const locations = useContext(ExternalAssetUrlContext);
  return resolveExternalAssetUrl(locations, value, explicitDigest);
}
