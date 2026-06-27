import { useState, useEffect, FormEvent } from "react";
import { LinkData } from "../types";
import {
  Link,
  Plus,
  Copy,
  Check,
  ExternalLink,
  Calendar,
  MousePointerClick,
  RefreshCcw,
  Globe,
  Settings,
  Sparkles,
  Info
} from "lucide-react";

interface LinkCreatorProps {
  links: LinkData[];
  onCreateLink: (targetUrl: string) => Promise<boolean>;
  onClearAll: () => void;
  isCreating: boolean;
}

export default function LinkCreator({ links, onCreateLink, onClearAll, isCreating }: LinkCreatorProps) {
  const [urlInput, setUrlInput] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  // Advanced tracking domain configuration
  const [domainMode, setDomainMode] = useState<"public" | "dev" | "custom">("public");
  const [customDomain, setCustomDomain] = useState("");
  const [backendAppUrl, setBackendAppUrl] = useState<string>("");

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.appUrl) {
          setBackendAppUrl(data.appUrl);
        }
      })
      .catch((err) => console.error("Error fetching config", err));
  }, []);

  const getSelectedBaseUrl = () => {
    if (domainMode === "custom" && customDomain.trim()) {
      let host = customDomain.trim();
      if (!/^https?:\/\//i.test(host)) {
        host = "https://" + host;
      }
      return host.replace(/\/$/, "");
    }

    if (domainMode === "public") {
      // If we have an APP_URL from server environment variables
      if (backendAppUrl && !backendAppUrl.includes("MY_APP_URL")) {
        return backendAppUrl.replace(/\/$/, "");
      }
      // Automagically swap the 'ais-dev' sandboxed frame origin block for the raw public 'ais-pre' shared container URL
      const origin = window.location.origin;
      if (origin.includes("ais-dev-")) {
        return origin.replace("ais-dev-", "ais-pre-");
      }
    }

    // Default to plain editor origin
    return window.location.origin;
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    // Call upstream prop
    const success = await onCreateLink(urlInput);
    if (success) {
      setUrlInput("");
      // Flash the latest link as just created
      const sorted = [...links].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      if (sorted.length > 0) {
        setJustCreated(sorted[0].short_code);
        setTimeout(() => setJustCreated(null), 10000); // clear highlighting after 10s
      }
    }
  };

  const fallbackCopy = (text: string, shortCode: string) => {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (success) {
        setCopiedCode(shortCode);
        setTimeout(() => setCopiedCode(null), 2000);
      }
    } catch (err) {
      console.warn("Fallback fallbackCopy method failed", err);
    }
  };

  const copyToClipboard = (shortCode: string) => {
    const fullUrl = `${getSelectedBaseUrl()}/t/${shortCode}`;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(fullUrl)
          .then(() => {
            setCopiedCode(shortCode);
            setTimeout(() => {
              setCopiedCode(null);
            }, 2000);
          })
          .catch((err) => {
            console.warn("navigator.clipboard error, trying fallback", err);
            fallbackCopy(fullUrl, shortCode);
          });
      } else {
        fallbackCopy(fullUrl, shortCode);
      }
    } catch (e) {
      console.warn("navigator.clipboard exception, trying fallback", e);
      fallbackCopy(fullUrl, shortCode);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Link Form Card */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl p-5 md:p-6 shadow-lg">
        <div className="flex items-center space-x-2.5 mb-4">
          <div className="p-2 bg-[#4a9eff]/10 rounded-lg">
            <Link className="w-5 h-5 text-[#4a9eff]" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-white font-display">Generate New Tracking Redirect URL</h3>
            <p className="text-xs text-gray-400">Generate a tracking address. When clicked, it logs visitor data then redirects instantly.</p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                <Link className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="Paste destination link"
                className="w-full pl-10 pr-4 py-3 bg-[#0f0f1a] border border-[#2a2a4a] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#4a9eff] focus:ring-1 focus:ring-[#4a9eff] transition-colors"
                disabled={isCreating}
              />
            </div>
            <button
              type="submit"
              disabled={isCreating || !urlInput.trim()}
              className="px-6 py-3 bg-[#4a9eff] hover:bg-[#3286eb] disabled:bg-[#4a9eff]/50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-lg flex items-center justify-center gap-2 transition-colors duration-150 shadow shadow-[#4a9eff]/25"
            >
              {isCreating ? (
                <>
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Generate Tracker
                </>
              )}
            </button>
          </div>
        </form>

        {/* Domain Settings Block */}
        <div className="mt-5 pt-5 border-t border-[#2a2a4a] space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings className="w-4 h-4 text-emerald-400" />
              <span className="font-semibold text-xs text-emerald-400 uppercase tracking-wider select-none">Tracking Link Settings</span>
            </div>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 font-mono font-medium px-2 py-0.5 rounded border border-emerald-400/20">
              Active Host: {getSelectedBaseUrl()}
            </span>
          </div>


          {domainMode === "custom" && (
            <div className="p-2.5 bg-slate-950/40 border border-[#2a2a4a] rounded-lg flex items-center gap-3">
              <span className="text-xs text-gray-300 font-medium whitespace-nowrap">Custom Host Address:</span>
              <input
                type="text"
                placeholder="e.g. tracker.mydomain.com"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                className="bg-black/40 border border-[#2a2a4a] focus:border-yellow-500/80 focus:outline-none rounded px-3 py-1.5 text-xs text-white flex-1 font-mono"
              />
            </div>
          )}
        </div>

        {/* Highlight the newly generated URL banner if available */}
        {links.length > 0 && (
          <div className="mt-5 p-3.5 bg-slate-900/60 border border-[#2a2a4a] rounded-lg text-xs">
            <div className="text-gray-400 font-semibold mb-1 uppercase tracking-wider text-[10px]">Your Most Recent Tracker:</div>
            {(() => {
              const latest = [...links].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
              if (!latest) return <span className="text-gray-500">Provide an URL above to generate a tracking link.</span>;
              const fullTrackingUrl = `${getSelectedBaseUrl()}/t/${latest.short_code}`;

              return (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-1.5 p-3 bg-[#16213e]/60 rounded-md border border-[#2a2a4a]">
                  <div className="space-y-1 overflow-hidden">
                    <div className="font-mono text-emerald-400 select-all font-semibold break-all text-sm">{fullTrackingUrl}</div>
                    <div className="text-gray-400 text-[11px] truncate block w-full">
                      Redirects to: <span className="text-white hover:underline font-mono">{latest.target_url}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(latest.short_code)}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#4a9eff]/10 hover:bg-[#4a9eff]/20 active:bg-[#4a9eff]/30 border border-[#4a9eff]/30 hover:border-[#4a9eff]/50 text-[#4a9eff] hover:text-white font-medium text-xs rounded transition-colors"
                    >
                      {copiedCode === latest.short_code ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy Link
                        </>
                      )}
                    </button>
                    <a
                      href={fullTrackingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 rounded text-xs transition-colors font-medium"
                    >
                      Test Redirect
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* List Active Links Card */}
      <div className="bg-[#16213e] border border-[#2a2a4a] rounded-xl overflow-hidden shadow-lg">
        <div className="px-5 py-4 border-b border-[#2a2a4a] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-gray-200">Active Tracking Links Catalog</h3>
            <p className="text-[11px] text-gray-400">Total of {links.length} tracking URLs active on this service</p>
          </div>
          {links.length > 0 && (
            <button
              onClick={onClearAll}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 border border-rose-500/20 hover:border-rose-500/40 text-rose-400 hover:text-rose-300 font-semibold text-xs rounded-md transition-colors"
            >
              Reset All Live Logs
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          {links.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-xs">
              <Link className="w-8 h-8 text-gray-600 mx-auto mb-2" />
              <span>No tracked redirect addresses configured.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#0f0f1a] text-[#8e98ac] font-bold border-b border-[#2a2a4a] select-none">
                  <th className="p-4">Short Tracking URL</th>
                  <th className="p-4">Destination Target (Original Link)</th>
                  <th className="p-4 text-center">Registration Count</th>
                  <th className="p-4">Date Configured</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2a4a]/40 bg-[#16213e]">
                {[...links]
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((link) => {
                    const fullUrl = `${getSelectedBaseUrl()}/t/${link.short_code}`;
                    const isNew = justCreated === link.short_code;

                    return (
                      <tr
                        key={link.short_code}
                        className={`transition-colors duration-200 ${
                          isNew ? "bg-[#10b981]/10 text-white" : "hover:bg-[#1c294a]/30"
                        }`}
                      >
                        {/* Tracking URL */}
                        <td className="p-4 font-mono select-all">
                          <span className="text-[#4a9eff] font-semibold">{ `/t/${link.short_code}` }</span>
                        </td>

                        {/* Destination Link */}
                        <td className="p-4 max-w-xs md:max-w-md">
                          <div className="truncate text-gray-300 font-mono" title={link.target_url}>
                            {link.target_url}
                          </div>
                        </td>

                        {/* Click statistics counter */}
                        <td className="p-4 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-[#203056] text-[#4a9eff] rounded font-semibold text-xs border border-[#2a2a4a]">
                            <MousePointerClick className="w-3.5 h-3.5" />
                            {link.clicks}
                          </span>
                        </td>

                        {/* Timestamp */}
                        <td className="p-4 text-gray-400 select-none">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gray-500" />
                            <span>{new Date(link.created_at).toLocaleDateString()}</span>
                          </div>
                        </td>

                        {/* Row Actions */}
                        <td className="p-4 text-right space-x-2">
                          <button
                            onClick={() => copyToClipboard(link.short_code)}
                            className="p-1 px-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-750 hover:text-white rounded transition-colors inline-flex items-center gap-1 font-semibold text-[11px]"
                            title="Copy full tracker link"
                          >
                            {copiedCode === link.short_code ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                            Copy
                          </button>
                          <a
                            href={fullUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 px-2.5 bg-[#4a9eff]/10 hover:bg-[#4a9eff]/20 text-[#4a9eff] border border-[#4a9eff]/20 rounded transition-colors inline-flex items-center gap-1 font-semibold text-[11px]"
                            title="Open tracking address"
                          >
                            Visit
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
